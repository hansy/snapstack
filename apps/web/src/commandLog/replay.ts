import type { ViewerRole, Zone, Player, Card, ZoneType } from "@/types";

import { ZONE } from "@/constants/zones";
import { enforceZoneCounterRules } from "@/lib/counters";
import { getZoneByType } from "@/lib/gameSelectors";
import { resolveOrderedPlayerIds } from "@/lib/playerColors";
import { MAX_PLAYERS } from "@/lib/room";
import { computeRevealPatchAfterMove, resolveControllerAfterMove, resolveFaceDownAfterMove } from "@/store/gameStore/actions/movementModel";
import { buildUpdateCardPatch, buildRevealPatch } from "@/store/gameStore/actions/cardsModel";
import { resetCardToFrontFace } from "@/lib/cardDisplay";
import { clampNormalizedPosition } from "@/lib/positions";
import { canMoveCard, canModifyCardState, canUpdatePlayer } from "@/rules/permissions";

import { base64UrlToBytes } from "@/crypto/base64url";
import { validateCommand, getCommandSigningBytes, deriveActorIdFromPublicKey } from "./commands";
import { computeNextLogHashHex, INITIAL_LOG_HASH_HEX } from "./logHash";
import type { CommandEnvelope } from "./types";
import {
  decryptJsonPayload,
  decryptPayloadForRecipient,
  deriveOwnerAesKey,
  deriveSpectatorAesKey,
} from "./crypto";
import { getSessionAccessKeys } from "@/lib/sessionKeys";
import { getSessionIdentityBytes } from "@/lib/sessionIdentity";
import { verifyEd25519 } from "@/crypto/ed25519";
import { extractCardIdentity, stripCardIdentity } from "./identity";

export type CommandLogState = {
  players: Record<string, Player & { signPubKey?: string; encPubKey?: string }>;
  playerOrder: string[];
  cards: Record<string, Card>;
  zones: Record<string, Zone>;
  globalCounters: Record<string, string>;
  battlefieldViewScale: Record<string, number>;
  roomHostId: string | null;
  roomLockedByHost: boolean;
  roomOverCapacity: boolean;
};

type CommandLogMeta = {
  lastAppliedIndex: number;
  lastSeqByActor: Record<string, number>;
  logHash: string;
};

type CommandLogContext = {
  sessionId: string;
  viewerId: string;
  viewerRole: ViewerRole;
  ownerAesKey?: Uint8Array;
  spectatorAesKey?: Uint8Array;
  recipientPrivateKey?: Uint8Array;
  playerKey?: Uint8Array;
};

const HIDDEN_ZONE_TYPES = new Set<ZoneType>([
  ZONE.LIBRARY,
  ZONE.HAND,
  ZONE.SIDEBOARD,
]);

const isHiddenZoneType = (zoneType: unknown): zoneType is ZoneType =>
  typeof zoneType === "string" && HIDDEN_ZONE_TYPES.has(zoneType as ZoneType);

const createPlaceholderCard = (params: {
  id: string;
  ownerId: string;
  zoneId: string;
}): Card => ({
  id: params.id,
  ownerId: params.ownerId,
  controllerId: params.ownerId,
  zoneId: params.zoneId,
  name: "Unknown Card",
  tapped: false,
  faceDown: false,
  position: { x: 0, y: 0 },
  rotation: 0,
  counters: [],
  knownToAll: false,
  revealedToAll: false,
  revealedTo: [],
});

const buildPlaceholderIds = (zoneId: string, count: number, existing: string[] = []) => {
  const prefix = `hidden:${zoneId}:`;
  const current = existing.filter((id) => id.startsWith(prefix));
  if (current.length >= count) return current.slice(0, count);
  const next = [...current];
  for (let i = current.length; i < count; i += 1) {
    next.push(`${prefix}${i}`);
  }
  return next;
};

const resolveHostId = (players: Record<string, Player>, playerOrder: string[]): string | null => {
  for (const id of playerOrder) {
    if (players[id]) return id;
  }
  const fallback = Object.keys(players).sort()[0];
  return fallback ?? null;
};

const normalizeHiddenCard = (card: Card, zoneId: string, zoneType: ZoneType): Card => {
  const reset = {
    ...card,
    zoneId,
    tapped: false,
    rotation: 0,
    position: { x: 0, y: 0 },
    counters: [],
  };
  if (zoneType === ZONE.LIBRARY) {
    return {
      ...reset,
      knownToAll: false,
      revealedToAll: false,
      revealedTo: [],
      faceDown: false,
    };
  }
  return reset;
};

const applyHiddenZone = (params: {
  state: CommandLogState;
  ownerId: string;
  zoneType: ZoneType;
  count: number;
  decryptedCards?: Card[];
  decryptedOrder?: string[];
}): CommandLogState => {
  const zone = getZoneByType(params.state.zones, params.ownerId, params.zoneType);
  if (!zone) return params.state;

  const nextZones = { ...params.state.zones };
  const nextCards = { ...params.state.cards };

  if (params.decryptedCards && params.decryptedOrder) {
    const cardMap = new Map(params.decryptedCards.map((card) => [card.id, card]));
    const nextOrder = params.decryptedOrder.filter((id) => cardMap.has(id));
    nextZones[zone.id] = { ...zone, cardIds: nextOrder };

    params.decryptedCards.forEach((card) => {
      const normalized = normalizeHiddenCard(card, zone.id, params.zoneType);
      nextCards[card.id] = normalized;
    });

    Object.values(nextCards).forEach((card) => {
      if (card.zoneId === zone.id && !nextOrder.includes(card.id)) {
        delete nextCards[card.id];
      }
    });

    return {
      ...params.state,
      zones: nextZones,
      cards: nextCards,
    };
  }

  if (params.decryptedOrder && !params.decryptedCards) {
    const nextOrder = params.decryptedOrder.filter((id) => typeof id === "string");
    nextZones[zone.id] = { ...zone, cardIds: nextOrder };

    Object.values(nextCards).forEach((card) => {
      if (card.zoneId === zone.id && !nextOrder.includes(card.id)) {
        delete nextCards[card.id];
      }
    });

    if (params.zoneType === ZONE.LIBRARY) {
      nextOrder.forEach((id) => {
        const card = nextCards[id];
        if (!card) return;
        nextCards[id] = {
          ...card,
          knownToAll: false,
          revealedToAll: false,
          revealedTo: [],
        };
      });
    }

    return {
      ...params.state,
      zones: nextZones,
      cards: nextCards,
    };
  }

  const placeholders = buildPlaceholderIds(zone.id, params.count, zone.cardIds);
  nextZones[zone.id] = { ...zone, cardIds: placeholders };

  Object.values(nextCards).forEach((card) => {
    if (card.zoneId === zone.id && !placeholders.includes(card.id)) {
      delete nextCards[card.id];
    }
  });

  placeholders.forEach((id) => {
    if (!nextCards[id]) {
      nextCards[id] = createPlaceholderCard({
        id,
        ownerId: zone.ownerId,
        zoneId: zone.id,
      });
    }
  });

  return {
    ...params.state,
    zones: nextZones,
    cards: nextCards,
  };
};

const applyPublicCardCreate = (params: {
  state: CommandLogState;
  card: Card;
  identityOverride?: Partial<Card>;
}): CommandLogState => {
  const zone = params.state.zones[params.card.zoneId];
  if (!zone) return params.state;
  const nextCards = { ...params.state.cards };
  const nextZones = { ...params.state.zones };

  const shouldHideIdentity =
    zone.type === ZONE.BATTLEFIELD && params.card.faceDown === true;
  let normalized: Card = {
    ...params.card,
    position: clampNormalizedPosition(params.card.position),
    counters: enforceZoneCounterRules(params.card.counters ?? [], zone),
    knownToAll:
      params.card.faceDown && zone.type === ZONE.BATTLEFIELD
        ? false
        : params.card.knownToAll ?? true,
    revealedToAll: params.card.revealedToAll ?? false,
    revealedTo: params.card.revealedTo ?? [],
  };
  if (shouldHideIdentity) {
    const existing = nextCards[params.card.id];
    normalized = stripCardIdentity(normalized);
    if (existing) {
      normalized = { ...normalized, ...extractCardIdentity(existing) };
    }
  }
  if (params.identityOverride) {
    normalized = { ...normalized, ...params.identityOverride };
  }

  nextCards[normalized.id] = normalized;
  nextZones[zone.id] = {
    ...zone,
    cardIds: zone.cardIds.includes(normalized.id)
      ? zone.cardIds
      : [...zone.cardIds, normalized.id],
  };

  return {
    ...params.state,
    cards: nextCards,
    zones: nextZones,
  };
};

const applyPublicCardRemove = (params: {
  state: CommandLogState;
  cardId: string;
}): CommandLogState => {
  const card = params.state.cards[params.cardId];
  if (!card) return params.state;
  const zone = params.state.zones[card.zoneId];

  const nextCards = { ...params.state.cards };
  delete nextCards[params.cardId];

  const nextZones = { ...params.state.zones };
  if (zone) {
    nextZones[zone.id] = {
      ...zone,
      cardIds: zone.cardIds.filter((id) => id !== params.cardId),
    };
  }

  return { ...params.state, cards: nextCards, zones: nextZones };
};

const applyCardUpdate = (params: {
  state: CommandLogState;
  cardId: string;
  updates: Partial<Card>;
  actorId: string;
  identityOverride?: Partial<Card>;
}): CommandLogState => {
  const card = params.state.cards[params.cardId];
  if (!card) return params.state;
  const zone = params.state.zones[card.zoneId];
  if (!zone) return params.state;

  const permission = canModifyCardState(
    { actorId: params.actorId, role: "player" },
    card,
    zone,
  );
  if (!permission.allowed) return params.state;

  const { next } = buildUpdateCardPatch(card, params.updates);
  const shouldMarkKnownAfterFaceUp =
    params.updates.faceDown === false &&
    card.faceDown === true &&
    zone.type === ZONE.BATTLEFIELD;
  const shouldHideAfterFaceDown =
    params.updates.faceDown === true &&
    card.faceDown === false &&
    zone.type === ZONE.BATTLEFIELD;

  const nextWithVisibility = shouldHideAfterFaceDown
    ? {
        ...next,
        knownToAll: false,
        revealedToAll: false,
        revealedTo: [],
      }
    : shouldMarkKnownAfterFaceUp
      ? { ...next, knownToAll: true }
      : next;

  let nextCard: Card = {
    ...nextWithVisibility,
    tapped: params.updates.tapped ?? nextWithVisibility.tapped,
    counters: params.updates.counters ?? nextWithVisibility.counters,
    position: params.updates.position ?? nextWithVisibility.position,
    rotation: params.updates.rotation ?? nextWithVisibility.rotation,
    controllerId: params.updates.controllerId ?? nextWithVisibility.controllerId,
  };
  const shouldHideIdentity = shouldHideAfterFaceDown;
  if (shouldHideIdentity) {
    nextCard = stripCardIdentity(nextCard);
  }
  if (params.identityOverride) {
    nextCard = { ...nextCard, ...params.identityOverride };
  }

  const nextCards = {
    ...params.state.cards,
    [params.cardId]: {
      ...nextCard,
      counters: enforceZoneCounterRules(nextCard.counters, zone),
    },
  };

  return { ...params.state, cards: nextCards };
};

const applyCardMove = (params: {
  state: CommandLogState;
  cardId: string;
  fromZoneId: string;
  toZoneId: string;
  actorId: string;
  position?: { x: number; y: number };
  faceDown?: boolean;
  controllerId?: string;
  placement?: "top" | "bottom";
  identityOverride?: Partial<Card>;
}): CommandLogState => {
  const card = params.state.cards[params.cardId];
  if (!card) return params.state;
  const fromZone = params.state.zones[params.fromZoneId];
  const toZone = params.state.zones[params.toZoneId];
  if (!fromZone || !toZone) return params.state;

  const permission = canMoveCard({
    actorId: params.actorId,
    role: "player",
    card,
    fromZone,
    toZone,
  });
  if (!permission.allowed) return params.state;

  const nextControllerId =
    params.controllerId ?? resolveControllerAfterMove(card, fromZone, toZone);
  const controlWillChange = nextControllerId !== card.controllerId;

  const faceDownResolution = resolveFaceDownAfterMove({
    fromZoneType: fromZone.type,
    toZoneType: toZone.type,
    currentFaceDown: card.faceDown,
    requestedFaceDown: params.faceDown,
  });
  const revealPatch = computeRevealPatchAfterMove({
    fromZoneType: fromZone.type,
    toZoneType: toZone.type,
    effectiveFaceDown: faceDownResolution.effectiveFaceDown,
  });

  const tokenLeavingBattlefield =
    card.isToken && toZone.type !== ZONE.BATTLEFIELD;
  if (tokenLeavingBattlefield) {
    return applyPublicCardRemove({ state: params.state, cardId: card.id });
  }

  const leavingBattlefield =
    fromZone.type === ZONE.BATTLEFIELD && toZone.type !== ZONE.BATTLEFIELD;
  const resetToFront = leavingBattlefield ? resetCardToFrontFace(card) : card;

  const nextZones = { ...params.state.zones };
  const nextCards = { ...params.state.cards };

  const placement = params.placement ?? "top";
  if (params.fromZoneId === params.toZoneId) {
    const without = fromZone.cardIds.filter((id) => id !== params.cardId);
    const reordered =
      placement === "bottom" ? [params.cardId, ...without] : [...without, params.cardId];
    nextZones[fromZone.id] = { ...fromZone, cardIds: reordered };
  } else {
    nextZones[fromZone.id] = {
      ...fromZone,
      cardIds: fromZone.cardIds.filter((id) => id !== params.cardId),
    };
    const toIds = toZone.cardIds.filter((id) => id !== params.cardId);
    nextZones[toZone.id] = {
      ...toZone,
      cardIds: placement === "bottom" ? [params.cardId, ...toIds] : [...toIds, params.cardId],
    };
  }

  const nextTapped = toZone.type === ZONE.BATTLEFIELD ? card.tapped : false;
  const nextCounters = enforceZoneCounterRules(card.counters, toZone);

  let movedCard: Card = {
    ...resetToFront,
    ...(revealPatch ?? {}),
    zoneId: params.toZoneId,
    position: clampNormalizedPosition(params.position ?? resetToFront.position),
    tapped: nextTapped,
    counters: nextCounters,
    faceDown: faceDownResolution.effectiveFaceDown,
    controllerId: controlWillChange ? nextControllerId : resetToFront.controllerId,
  };
  const shouldHideIdentity =
    toZone.type === ZONE.BATTLEFIELD &&
    card.faceDown === false &&
    movedCard.faceDown === true;
  if (shouldHideIdentity) {
    movedCard = stripCardIdentity(movedCard);
  }
  if (params.identityOverride) {
    movedCard = { ...movedCard, ...params.identityOverride };
  }
  nextCards[params.cardId] = movedCard;

  return {
    ...params.state,
    zones: nextZones,
    cards: nextCards,
  };
};

const applyZoneReorder = (params: {
  state: CommandLogState;
  zoneId: string;
  orderedCardIds: string[];
  actorId: string;
}): CommandLogState => {
  const zone = params.state.zones[params.zoneId];
  if (!zone) return params.state;
  if (zone.ownerId !== params.actorId) return params.state;

  const currentSet = new Set(zone.cardIds);
  const containsSame =
    params.orderedCardIds.every((id) => currentSet.has(id)) &&
    zone.cardIds.every((id) => params.orderedCardIds.includes(id));
  if (!containsSame) return params.state;

  const nextZones = {
    ...params.state.zones,
    [zone.id]: { ...zone, cardIds: params.orderedCardIds },
  };
  return { ...params.state, zones: nextZones };
};

const applyPlayerUpdate = (params: {
  state: CommandLogState;
  actorId: string;
  updates: Partial<Player> & { playerId?: string; battlefieldViewScale?: number | null };
}): CommandLogState => {
  const playerId = params.updates.playerId ?? params.actorId;
  const current = params.state.players[playerId];
  if (!current) return params.state;

  const permission = canUpdatePlayer(
    { actorId: params.actorId, role: "player" },
    current,
    params.updates,
  );
  if (!permission.allowed) return params.state;

  const nextPlayers = { ...params.state.players };
  const nextPlayer = { ...current, ...params.updates };
  if (params.updates.libraryTopReveal === null) {
    delete (nextPlayer as { libraryTopReveal?: unknown }).libraryTopReveal;
  }
  delete (nextPlayer as { playerId?: string }).playerId;
  delete (nextPlayer as { battlefieldViewScale?: number }).battlefieldViewScale;
  nextPlayers[playerId] = nextPlayer;

  let nextBattlefieldScale = params.state.battlefieldViewScale;
  if (typeof params.updates.battlefieldViewScale === "number") {
    const clamped = Math.min(Math.max(params.updates.battlefieldViewScale, 0.5), 1);
    nextBattlefieldScale = {
      ...params.state.battlefieldViewScale,
      [playerId]: clamped,
    };
  }

  return {
    ...params.state,
    players: nextPlayers,
    battlefieldViewScale: nextBattlefieldScale,
  };
};

const applyRoomLock = (params: {
  state: CommandLogState;
  actorId: string;
  locked: boolean;
}): CommandLogState => {
  if (params.state.roomHostId && params.state.roomHostId !== params.actorId) {
    return params.state;
  }
  return { ...params.state, roomLockedByHost: params.locked };
};

const applyReveal = (params: {
  state: CommandLogState;
  cardId: string;
  revealToAll: boolean;
  revealTo?: string[];
  identity?: Partial<Card>;
  revealedPayload?: Partial<Card>;
  zoneId?: string;
  viewerId: string;
  viewerRole: ViewerRole;
}): CommandLogState => {
  let existing = params.state.cards[params.cardId];
  let zone = existing ? params.state.zones[existing.zoneId] : undefined;
  let nextZones = params.state.zones;
  let nextCards = params.state.cards;

  if (!existing && params.zoneId) {
    const targetZone = params.state.zones[params.zoneId];
    if (!targetZone) return params.state;
    existing = createPlaceholderCard({
      id: params.cardId,
      ownerId: targetZone.ownerId,
      zoneId: targetZone.id,
    });
    const updatedIds = targetZone.cardIds.includes(params.cardId)
      ? targetZone.cardIds
      : [...targetZone.cardIds, params.cardId];
    nextZones = { ...params.state.zones, [targetZone.id]: { ...targetZone, cardIds: updatedIds } };
    nextCards = { ...params.state.cards, [params.cardId]: existing };
    zone = targetZone;
  }

  if (!existing || !zone) return params.state;

  const updates = buildRevealPatch(
    existing,
    params.revealToAll ? { toAll: true } : { to: params.revealTo },
  );

  let updated = { ...existing, ...updates };

  if (params.identity && params.revealToAll) {
    updated = { ...updated, ...params.identity, knownToAll: updated.knownToAll ?? false };
  }

  if (params.revealedPayload) {
    updated = { ...updated, ...params.revealedPayload };
  }

  nextCards[params.cardId] = updated;
  return { ...params.state, cards: nextCards, zones: nextZones };
};

const applyLibraryTopReveal = (params: {
  state: CommandLogState;
  ownerId: string;
  mode: "self" | "all" | null | undefined;
  cardId?: string;
  identity?: Partial<Card>;
  viewerId: string;
  viewerRole: ViewerRole;
}): CommandLogState => {
  const player = params.state.players[params.ownerId];
  if (!player) return params.state;

  const nextPlayers = { ...params.state.players };
  const nextMode = params.mode ?? null;
  nextPlayers[params.ownerId] = {
    ...player,
    libraryTopReveal: nextMode ?? undefined,
  };

  if (nextMode === "all" && params.cardId && params.identity) {
    const zone = getZoneByType(params.state.zones, params.ownerId, ZONE.LIBRARY);
    if (!zone || zone.cardIds.length === 0) {
      return { ...params.state, players: nextPlayers };
    }
    const topIndex = zone.cardIds.length - 1;
    const topId = zone.cardIds[topIndex];
    const nextZones = { ...params.state.zones };
    const nextCards = { ...params.state.cards };
    let resolvedId = topId;
    if (topId.startsWith("hidden:")) {
      const updatedIds = [...zone.cardIds];
      updatedIds[topIndex] = params.cardId;
      nextZones[zone.id] = { ...zone, cardIds: updatedIds };
      resolvedId = params.cardId;
    }

    const existing =
      nextCards[resolvedId] ??
      createPlaceholderCard({
        id: resolvedId,
        ownerId: params.ownerId,
        zoneId: zone.id,
      });
    nextCards[resolvedId] = {
      ...existing,
      ...params.identity,
      knownToAll: true,
      zoneId: zone.id,
    } as Card;

    if (topId.startsWith("hidden:") && topId !== resolvedId) {
      delete nextCards[topId];
    }

    return {
      ...params.state,
      players: nextPlayers,
      zones: nextZones,
      cards: nextCards,
    };
  }

  if (nextMode !== "all" && params.viewerId !== params.ownerId) {
    const zone = getZoneByType(params.state.zones, params.ownerId, ZONE.LIBRARY);
    if (!zone || zone.cardIds.length === 0) {
      return { ...params.state, players: nextPlayers };
    }
    const topIndex = zone.cardIds.length - 1;
    const topId = zone.cardIds[topIndex];
    if (!topId.startsWith("hidden:")) {
      const placeholderId = `hidden:${zone.id}:${topIndex}`;
      const nextZones = {
        ...params.state.zones,
        [zone.id]: {
          ...zone,
          cardIds: zone.cardIds.map((id, idx) => (idx === topIndex ? placeholderId : id)),
        },
      };
      const nextCards = { ...params.state.cards };
      delete nextCards[topId];
      if (!nextCards[placeholderId]) {
        nextCards[placeholderId] = createPlaceholderCard({
          id: placeholderId,
          ownerId: zone.ownerId,
          zoneId: zone.id,
        });
      }
      return {
        ...params.state,
        players: nextPlayers,
        zones: nextZones,
        cards: nextCards,
      };
    }
  }

  return { ...params.state, players: nextPlayers };
};

const applyGlobalCounter = (params: {
  state: CommandLogState;
  key: string;
  value: string;
}): CommandLogState => {
  if (!params.key) return params.state;
  if (params.state.globalCounters[params.key]) return params.state;
  return {
    ...params.state,
    globalCounters: {
      ...params.state.globalCounters,
      [params.key]: params.value,
    },
  };
};

const decodeIdentityForViewer = async (params: {
  envelope: CommandEnvelope;
  ctx: CommandLogContext;
}): Promise<Partial<Card> | undefined> => {
  const { envelope, ctx } = params;
  const recipientPayload = ctx.viewerId
    ? envelope.payloadRecipientsEnc?.[ctx.viewerId]
    : undefined;
  if (recipientPayload && ctx.recipientPrivateKey) {
    try {
      return (await decryptPayloadForRecipient({
        payload: recipientPayload,
        recipientPrivateKey: ctx.recipientPrivateKey,
        sessionId: ctx.sessionId,
      })) as Partial<Card>;
    } catch (_err) {}
  }

  if (
    ctx.viewerRole === "spectator" &&
    ctx.spectatorAesKey &&
    envelope.payloadSpectatorEnc
  ) {
    try {
      return (await decryptJsonPayload(
        ctx.spectatorAesKey,
        envelope.payloadSpectatorEnc,
      )) as Partial<Card>;
    } catch (_err) {}
  }

  return undefined;
};

const applyCommandInternal = async (params: {
  state: CommandLogState;
  envelope: CommandEnvelope;
  ctx: CommandLogContext;
}): Promise<CommandLogState> => {
  const { envelope, ctx } = params;
  const payload = envelope.payloadPublic;

  switch (envelope.type) {
    case "player.join": {
      if (!payload || typeof payload !== "object") return params.state;
      const data = payload as {
        playerId?: string;
        name?: string;
        color?: string;
        signPubKey?: string;
        encPubKey?: string;
      };
      if (!data.playerId) return params.state;
      if (data.playerId !== envelope.actorId) return params.state;
      if (data.signPubKey && data.signPubKey !== envelope.pubKey) return params.state;

      const nextPlayers = { ...params.state.players };
      const existing = nextPlayers[data.playerId];
      if (!existing) {
        nextPlayers[data.playerId] = {
          id: data.playerId,
          name: data.name ?? `Player ${data.playerId.slice(0, 4)}`,
          life: 40,
          counters: [],
          commanderDamage: {},
          commanderTax: 0,
          deckLoaded: false,
          color: data.color,
          signPubKey: data.signPubKey,
          encPubKey: data.encPubKey,
        };
      } else {
        nextPlayers[data.playerId] = {
          ...existing,
          name: data.name ?? existing.name,
          color: data.color ?? existing.color,
          signPubKey: data.signPubKey ?? existing.signPubKey,
          encPubKey: data.encPubKey ?? existing.encPubKey,
        };
      }

      const nextOrder = params.state.playerOrder.includes(data.playerId)
        ? params.state.playerOrder
        : [...params.state.playerOrder, data.playerId];

      const nextZones = { ...params.state.zones };
      const zoneTypes = [
        ZONE.LIBRARY,
        ZONE.HAND,
        ZONE.BATTLEFIELD,
        ZONE.GRAVEYARD,
        ZONE.EXILE,
        ZONE.COMMANDER,
        ZONE.SIDEBOARD,
      ] as const;
      zoneTypes.forEach((type) => {
        const existingZone = getZoneByType(nextZones, data.playerId!, type);
        if (existingZone) return;
        const zoneId = `${data.playerId}-${type}`;
        nextZones[zoneId] = {
          id: zoneId,
          ownerId: data.playerId!,
          type,
          cardIds: [],
        };
      });

      return {
        ...params.state,
        players: nextPlayers,
        playerOrder: nextOrder,
        zones: nextZones,
      };
    }
    case "player.leave": {
      if (!payload || typeof payload !== "object") return params.state;
      const data = payload as { playerId?: string };
      if (!data.playerId) return params.state;
      if (data.playerId !== envelope.actorId) return params.state;

      const nextPlayers = { ...params.state.players };
      delete nextPlayers[data.playerId];

      const nextZones = { ...params.state.zones };
      const nextCards = { ...params.state.cards };

      Object.values(nextZones).forEach((zone) => {
        if (zone.ownerId !== data.playerId) return;
        zone.cardIds.forEach((cardId) => {
          delete nextCards[cardId];
        });
        delete nextZones[zone.id];
      });

      Object.values(nextCards).forEach((card) => {
        if (card.ownerId === data.playerId) {
          delete nextCards[card.id];
        }
      });

      const nextOrder = params.state.playerOrder.filter((id) => id !== data.playerId);
      const nextScale = { ...params.state.battlefieldViewScale };
      delete nextScale[data.playerId];

      return {
        ...params.state,
        players: nextPlayers,
        playerOrder: nextOrder,
        zones: nextZones,
        cards: nextCards,
        battlefieldViewScale: nextScale,
      };
    }
    case "player.update": {
      if (!payload || typeof payload !== "object") return params.state;
      const data = payload as Record<string, unknown>;
      const playerId = typeof data.playerId === "string" ? data.playerId : envelope.actorId;
      return applyPlayerUpdate({
        state: params.state,
        actorId: envelope.actorId,
        updates: { ...(data as Partial<Player>), playerId },
      });
    }
    case "room.lock.set": {
      if (!payload || typeof payload !== "object") return params.state;
      const locked = (payload as { locked?: boolean }).locked;
      if (typeof locked !== "boolean") return params.state;
      return applyRoomLock({ state: params.state, actorId: envelope.actorId, locked });
    }
    case "battlefield.scale.set": {
      if (!payload || typeof payload !== "object") return params.state;
      const data = payload as { playerId?: string; scale?: number };
      if (!data.playerId || typeof data.scale !== "number") return params.state;
      return applyPlayerUpdate({
        state: params.state,
        actorId: envelope.actorId,
        updates: { playerId: data.playerId, battlefieldViewScale: data.scale },
      });
    }
    case "global.counter.set": {
      if (!payload || typeof payload !== "object") return params.state;
      const data = payload as { key?: string; value?: string };
      if (!data.key || !data.value) return params.state;
      return applyGlobalCounter({ state: params.state, key: data.key, value: data.value });
    }
    case "zone.reorder.public": {
      if (!payload || typeof payload !== "object") return params.state;
      const data = payload as { zoneId?: string; cardIds?: string[] };
      if (!data.zoneId || !Array.isArray(data.cardIds)) return params.state;
      return applyZoneReorder({
        state: params.state,
        zoneId: data.zoneId,
        orderedCardIds: data.cardIds.filter((id) => typeof id === "string"),
        actorId: envelope.actorId,
      });
    }
    case "card.create.public": {
      if (!payload || typeof payload !== "object") return params.state;
      const data = payload as { card?: Card } | Card;
      const card = "card" in data ? data.card : (data as Card);
      if (!card || typeof card.id !== "string") return params.state;
      const identityOverride = await decodeIdentityForViewer({
        envelope,
        ctx,
      });
      return applyPublicCardCreate({
        state: params.state,
        card,
        identityOverride,
      });
    }
    case "card.remove.public": {
      if (!payload || typeof payload !== "object") return params.state;
      const data = payload as { cardId?: string };
      if (!data.cardId) return params.state;
      return applyPublicCardRemove({ state: params.state, cardId: data.cardId });
    }
    case "card.update.public": {
      if (!payload || typeof payload !== "object") return params.state;
      const data = payload as { cardId?: string; updates?: Partial<Card> };
      if (!data.cardId || !data.updates) return params.state;
      const identityOverride = await decodeIdentityForViewer({
        envelope,
        ctx,
      });
      return applyCardUpdate({
        state: params.state,
        cardId: data.cardId,
        updates: data.updates,
        actorId: envelope.actorId,
        identityOverride,
      });
    }
    case "card.move.public": {
      if (!payload || typeof payload !== "object") return params.state;
      const data = payload as {
        cardId?: string;
        fromZoneId?: string;
        toZoneId?: string;
        position?: { x: number; y: number };
        faceDown?: boolean;
        controllerId?: string;
        placement?: "top" | "bottom";
      };
      if (!data.cardId || !data.fromZoneId || !data.toZoneId) return params.state;
      const identityOverride = await decodeIdentityForViewer({
        envelope,
        ctx,
      });
      return applyCardMove({
        state: params.state,
        cardId: data.cardId,
        fromZoneId: data.fromZoneId,
        toZoneId: data.toZoneId,
        actorId: envelope.actorId,
        position: data.position,
        faceDown: data.faceDown,
        controllerId: data.controllerId,
        placement: data.placement,
        identityOverride,
      });
    }
    case "card.untapAll": {
      if (!payload || typeof payload !== "object") return params.state;
      const data = payload as { playerId?: string };
      if (!data.playerId) return params.state;
      if (data.playerId !== envelope.actorId) return params.state;
      const nextCards = { ...params.state.cards };
      Object.values(nextCards).forEach((card) => {
        if (card.controllerId === data.playerId && card.tapped) {
          nextCards[card.id] = { ...card, tapped: false };
        }
      });
      return { ...params.state, cards: nextCards };
    }
    case "zone.set.hidden": {
      if (!payload || typeof payload !== "object") return params.state;
      const data = payload as { ownerId?: string; zoneType?: string; count?: number };
      if (!data.ownerId || !data.zoneType || typeof data.count !== "number") {
        return params.state;
      }
      if (data.ownerId !== envelope.actorId) return params.state;
      if (!isHiddenZoneType(data.zoneType)) return params.state;

      let decryptedCards: Card[] | undefined;
      let decryptedOrder: string[] | undefined;

      if (ctx.viewerId === data.ownerId && ctx.ownerAesKey && envelope.payloadOwnerEnc) {
        try {
          const decoded = (await decryptJsonPayload(
            ctx.ownerAesKey,
            envelope.payloadOwnerEnc,
          )) as { cards?: Card[]; order?: string[] };
          if (decoded && Array.isArray(decoded.cards) && Array.isArray(decoded.order)) {
            decryptedCards = decoded.cards;
            decryptedOrder = decoded.order;
          }
        } catch (_err) {}
      } else if (
        ctx.viewerRole === "spectator" &&
        ctx.spectatorAesKey &&
        envelope.payloadSpectatorEnc &&
        data.zoneType === ZONE.HAND
      ) {
        try {
          const decoded = (await decryptJsonPayload(
            ctx.spectatorAesKey,
            envelope.payloadSpectatorEnc,
          )) as { cards?: Card[]; order?: string[] };
          if (decoded && Array.isArray(decoded.cards)) {
            decryptedCards = decoded.cards;
            decryptedOrder = Array.isArray(decoded.order)
              ? decoded.order
              : decoded.cards.map((card) => card.id);
          }
        } catch (_err) {}
      }

      return applyHiddenZone({
        state: params.state,
        ownerId: data.ownerId,
        zoneType: data.zoneType,
        count: data.count,
        decryptedCards,
        decryptedOrder,
      });
    }
    case "library.shuffle": {
      if (!payload || typeof payload !== "object") return params.state;
      const data = payload as { ownerId?: string; count?: number };
      if (!data.ownerId || typeof data.count !== "number") return params.state;
      if (data.ownerId !== envelope.actorId) return params.state;

      let decryptedOrder: string[] | undefined;
      if (ctx.viewerId === data.ownerId && ctx.ownerAesKey && envelope.payloadOwnerEnc) {
        try {
          const decoded = (await decryptJsonPayload(
            ctx.ownerAesKey,
            envelope.payloadOwnerEnc,
          )) as { order?: string[] };
          if (decoded && Array.isArray(decoded.order)) {
            decryptedOrder = decoded.order;
          }
        } catch (_err) {}
      }

      return applyHiddenZone({
        state: params.state,
        ownerId: data.ownerId,
        zoneType: ZONE.LIBRARY,
        count: data.count,
        decryptedCards: undefined,
        decryptedOrder,
      });
    }
    case "card.draw": {
      if (!payload || typeof payload !== "object") return params.state;
      const data = payload as { ownerId?: string; count?: number };
      if (!data.ownerId || typeof data.count !== "number") return params.state;
      if (data.ownerId !== envelope.actorId) return params.state;

      let handCards: Card[] | undefined;
      let libraryOrder: string[] | undefined;

      if (ctx.viewerId === data.ownerId && ctx.ownerAesKey && envelope.payloadOwnerEnc) {
        try {
          const decoded = (await decryptJsonPayload(
            ctx.ownerAesKey,
            envelope.payloadOwnerEnc,
          )) as { hand?: Card[]; order?: string[] };
          if (decoded && Array.isArray(decoded.hand)) {
            handCards = decoded.hand;
            libraryOrder = Array.isArray(decoded.order) ? decoded.order : undefined;
          }
        } catch (_err) {}
      } else if (
        ctx.viewerRole === "spectator" &&
        ctx.spectatorAesKey &&
        envelope.payloadSpectatorEnc
      ) {
        try {
          const decoded = (await decryptJsonPayload(
            ctx.spectatorAesKey,
            envelope.payloadSpectatorEnc,
          )) as { hand?: Card[] };
          if (decoded && Array.isArray(decoded.hand)) {
            handCards = decoded.hand;
          }
        } catch (_err) {}
      }

      let nextState = params.state;

      if (handCards) {
        const handZone = getZoneByType(nextState.zones, data.ownerId, ZONE.HAND);
        if (handZone) {
          const handOrder = handCards.map((card) => card.id);
          nextState = applyHiddenZone({
            state: nextState,
            ownerId: data.ownerId,
            zoneType: ZONE.HAND,
            count: handOrder.length,
            decryptedCards: handCards,
            decryptedOrder: handOrder,
          });
        }
      } else {
        nextState = applyHiddenZone({
          state: nextState,
          ownerId: data.ownerId,
          zoneType: ZONE.HAND,
          count: Math.max(0, data.count + (getZoneByType(nextState.zones, data.ownerId, ZONE.HAND)?.cardIds.length ?? 0)),
        });
      }

      if (libraryOrder) {
        nextState = applyHiddenZone({
          state: nextState,
          ownerId: data.ownerId,
          zoneType: ZONE.LIBRARY,
          count: libraryOrder.length,
          decryptedOrder: libraryOrder,
        });
      } else {
        const libraryZone = getZoneByType(nextState.zones, data.ownerId, ZONE.LIBRARY);
        const currentCount = libraryZone?.cardIds.length ?? 0;
        nextState = applyHiddenZone({
          state: nextState,
          ownerId: data.ownerId,
          zoneType: ZONE.LIBRARY,
          count: Math.max(0, currentCount - data.count),
        });
      }

      return nextState;
    }
    case "card.reveal.set": {
      if (!payload || typeof payload !== "object") return params.state;
      const data = payload as {
        cardId?: string;
        zoneId?: string;
        revealToAll?: boolean;
        revealTo?: string[];
        identity?: Partial<Card>;
      };
      if (!data.cardId) return params.state;

      const existing = params.state.cards[data.cardId];
      if (existing) {
        if (existing.ownerId !== envelope.actorId) return params.state;
      } else if (data.zoneId) {
        const zone = params.state.zones[data.zoneId];
        if (!zone || zone.ownerId !== envelope.actorId) return params.state;
      } else {
        return params.state;
      }

      let revealedPayload: Partial<Card> | undefined;
      if (data.revealTo && data.revealTo.includes(ctx.viewerId)) {
        const recipientPayload = envelope.payloadRecipientsEnc?.[ctx.viewerId];
        if (recipientPayload && ctx.recipientPrivateKey) {
          try {
            const decoded = (await decryptPayloadForRecipient({
              payload: recipientPayload,
              recipientPrivateKey: ctx.recipientPrivateKey,
              sessionId: ctx.sessionId,
            })) as Partial<Card>;
            revealedPayload = decoded;
          } catch (_err) {}
        }
      }

      return applyReveal({
        state: params.state,
        cardId: data.cardId,
        revealToAll: Boolean(data.revealToAll),
        revealTo: data.revealTo,
        identity: data.identity,
        revealedPayload,
        zoneId: data.zoneId,
        viewerId: ctx.viewerId,
        viewerRole: ctx.viewerRole,
      });
    }
    case "library.topReveal.set": {
      if (!payload || typeof payload !== "object") return params.state;
      const data = payload as {
        ownerId?: string;
        mode?: "self" | "all" | null;
        cardId?: string;
        identity?: Partial<Card>;
      };
      if (!data.ownerId) return params.state;
      if (data.ownerId !== envelope.actorId) return params.state;
      const mode =
        data.mode === "self" || data.mode === "all" || data.mode === null
          ? data.mode
          : null;
      return applyLibraryTopReveal({
        state: params.state,
        ownerId: data.ownerId,
        mode,
        cardId: data.cardId,
        identity: data.identity,
        viewerId: ctx.viewerId,
        viewerRole: ctx.viewerRole,
      });
    }
    default:
      return params.state;
  }
};

const rebuildDerivedMeta = (state: CommandLogState): CommandLogState => {
  const orderedIds = resolveOrderedPlayerIds(state.players, state.playerOrder);
  const hostId = resolveHostId(state.players as Record<string, Player>, orderedIds);
  const roomOverCapacity = Object.keys(state.players).length > MAX_PLAYERS;
  return {
    ...state,
    roomHostId: hostId,
    roomOverCapacity,
    playerOrder: orderedIds,
  };
};

export const createEmptyCommandLogState = (): CommandLogState => ({
  players: {},
  playerOrder: [],
  cards: {},
  zones: {},
  globalCounters: {},
  battlefieldViewScale: {},
  roomHostId: null,
  roomLockedByHost: false,
  roomOverCapacity: false,
});

export const createCommandLogContext = (params: {
  sessionId: string;
  viewerId: string;
  viewerRole: ViewerRole;
}): CommandLogContext => {
  const keys = getSessionAccessKeys(params.sessionId);
  const identityBytes = getSessionIdentityBytes(params.sessionId);
  const isSpectator = params.viewerRole === "spectator";
  const ownerAesKey =
    !isSpectator && identityBytes.ownerKey
      ? deriveOwnerAesKey({
          ownerKey: identityBytes.ownerKey,
          sessionId: params.sessionId,
        })
      : undefined;
  const spectatorKeyBytes = keys.spectatorKey ? base64UrlToBytes(keys.spectatorKey) : undefined;
  const spectatorAesKey = spectatorKeyBytes
    ? deriveSpectatorAesKey({ spectatorKey: spectatorKeyBytes, sessionId: params.sessionId })
    : undefined;
  const playerKey = keys.playerKey ? base64UrlToBytes(keys.playerKey) : undefined;

  return {
    sessionId: params.sessionId,
    viewerId: params.viewerId,
    viewerRole: params.viewerRole,
    ownerAesKey,
    spectatorAesKey,
    recipientPrivateKey: isSpectator ? undefined : identityBytes.encPrivateKey,
    playerKey,
  };
};

const validateSignatureOnly = (params: {
  envelope: CommandEnvelope;
}): boolean => {
  try {
    const pubKeyBytes = base64UrlToBytes(params.envelope.pubKey);
    const derivedActorId = deriveActorIdFromPublicKey(pubKeyBytes);
    if (derivedActorId !== params.envelope.actorId) return false;
    const signingBytes = getCommandSigningBytes(params.envelope);
    return verifyEd25519(
      base64UrlToBytes(params.envelope.sig),
      signingBytes,
      pubKeyBytes,
    );
  } catch (_err) {
    return false;
  }
};

export const applyCommandLog = async (params: {
  state: CommandLogState;
  meta: CommandLogMeta;
  envelope: CommandEnvelope;
  ctx: CommandLogContext;
}): Promise<{ state: CommandLogState; meta: CommandLogMeta }> => {
  const { envelope, ctx, meta } = params;

  const expectedSeq = meta.lastSeqByActor[envelope.actorId]
    ? meta.lastSeqByActor[envelope.actorId] + 1
    : 1;

  let valid = false;
  if (ctx.playerKey) {
    const validation = validateCommand({
      envelope,
      sessionId: ctx.sessionId,
      playerKey: ctx.playerKey,
      expectedSeq,
    });
    if (!validation.ok) {
      return { state: params.state, meta };
    }
    valid = true;
  } else {
    if (envelope.seq !== expectedSeq) {
      return { state: params.state, meta };
    }
    if (!validateSignatureOnly({ envelope })) {
      return { state: params.state, meta };
    }
    valid = true;
  }

  if (valid) {
    meta.lastSeqByActor[envelope.actorId] = envelope.seq;
    meta.logHash = computeNextLogHashHex({ prevLogHash: meta.logHash, envelope });
  }

  const nextState = await applyCommandInternal({
    state: params.state,
    envelope,
    ctx,
  });
  const rebuilt = rebuildDerivedMeta(nextState);

  return { state: rebuilt, meta };
};

export const createCommandLogMeta = (): CommandLogMeta => ({
  lastAppliedIndex: 0,
  lastSeqByActor: {},
  logHash: INITIAL_LOG_HASH_HEX,
});
