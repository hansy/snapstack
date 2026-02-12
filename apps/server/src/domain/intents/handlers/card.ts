import type { Card } from "@mtg/shared/types/cards";
import type { Counter } from "@mtg/shared/types/counters";

import { ZONE, isCommanderZoneType, isHiddenZoneType } from "../../constants";
import {
  applyCardUpdates,
  buildCardIdentity,
  buildDuplicateTokenCard,
  computeDuplicateTokenPosition,
  computeTransformTargetIndex,
  decrementCounter,
  enforceZoneCounterRules,
  getCardFaces,
  getCurrentFaceIndex,
  isTransformableCard,
  mergeCardIdentity,
  mergeCounters,
  normalizeCardForAdd,
  stripCardIdentity,
  syncCardStatsToFace,
} from "../../cards";
import {
  buildLibraryOrderKey,
  buildRevealPatch,
  clearFaceDownStateForCard,
  syncLibraryRevealsToAllForPlayer,
  updatePlayerCounts,
} from "../../hiddenState";
import { placeCardId, removeFromArray } from "../../lists";
import { applyCardMove } from "../../movement";
import { canAddCard, canModifyCardState, canMoveCard, canRemoveToken, canTapCard } from "../../permissions";
import {
  isRecord,
  readCard,
  readRecord,
  readZone,
  writeCard,
  writeZone,
} from "../../yjsStore";
import type { HiddenReveal, HiddenState, InnerApplyResult, Maps } from "../../types";
import {
  ensurePermission,
  readBoolean,
  readNumber,
  readNonEmptyString,
  readRecordValue,
  requireArrayProp,
  requireNonEmptyStringProp,
  requireRecordProp,
} from "../validation";
import type { IntentHandler } from "./types";

type PreparedCardAdd = {
  card: Card;
  zoneId: string;
  isCommanderZone: boolean;
};

const getLiveCommanderZoneCardIds = (maps: Maps, zoneId: string, cardIds: string[]): string[] =>
  cardIds.filter((cardId) => {
    const existing = readCard(maps, cardId);
    return Boolean(existing && existing.zoneId === zoneId);
  });

const prepareCardAdd = (
  actorId: string,
  maps: Maps,
  raw: unknown,
  opts?: { pendingCommanderAddsByZone?: Map<string, number> }
): PreparedCardAdd | { error: string } => {
  if (!actorId) return { error: "missing actor" };
  const card = readRecordValue(raw) ? (raw as unknown as Card) : null;
  if (!card || typeof card.id !== "string") return { error: "invalid card" };
  const normalized = normalizeCardForAdd(card);
  const zone = readZone(maps, normalized.zoneId);
  if (!zone) return { error: "zone not found" };
  const commanderZone = isCommanderZoneType(zone.type);
  let zoneForPermission = zone;
  if (commanderZone) {
    const liveCardIds = getLiveCommanderZoneCardIds(maps, zone.id, zone.cardIds);
    const pendingAdds = opts?.pendingCommanderAddsByZone?.get(zone.id) ?? 0;
    const pendingIds = Array.from(
      { length: pendingAdds },
      (_value, index) => `pending:commander:${zone.id}:${index}`
    );
    zoneForPermission = { ...zone, cardIds: [...liveCardIds, ...pendingIds] };
  }
  const permission = canAddCard(actorId, normalized, zoneForPermission);
  if (!permission.allowed) {
    return { error: permission.reason ?? "not permitted" };
  }
  return { card: normalized, zoneId: zone.id, isCommanderZone: commanderZone };
};

const applyPreparedCardAdd = (
  actorId: string,
  maps: Maps,
  hidden: HiddenState,
  prepared: PreparedCardAdd,
  pushLogEvent: (eventId: string, payload: Record<string, unknown>) => void,
  markHiddenChanged: (impact?: {
    ownerId?: string;
    zoneId?: string;
    reveal?: HiddenReveal;
    prevReveal?: HiddenReveal;
  }) => void
): InnerApplyResult => {
  if (!actorId) return { ok: false, error: "missing actor" };
  const zone = readZone(maps, prepared.zoneId);
  if (!zone) return { ok: false, error: "zone not found" };
  const nextCounters = enforceZoneCounterRules(prepared.card.counters, zone ?? undefined);
  const nextCard = { ...prepared.card, counters: nextCounters };
  if (zone && isHiddenZoneType(zone.type)) {
    hidden.cards[nextCard.id] = nextCard;
    if (zone.type === ZONE.HAND) {
      const nextOrder = placeCardId(hidden.handOrder[zone.ownerId] ?? [], nextCard.id, "top");
      hidden.handOrder[zone.ownerId] = nextOrder;
      writeZone(maps, { ...zone, cardIds: nextOrder });
    } else if (zone.type === ZONE.LIBRARY) {
      hidden.libraryOrder[zone.ownerId] = placeCardId(
        hidden.libraryOrder[zone.ownerId] ?? [],
        nextCard.id,
        "top"
      );
    } else if (zone.type === ZONE.SIDEBOARD) {
      hidden.sideboardOrder[zone.ownerId] = placeCardId(
        hidden.sideboardOrder[zone.ownerId] ?? [],
        nextCard.id,
        "top"
      );
    }
    updatePlayerCounts(maps, hidden, zone.ownerId);
    markHiddenChanged({ ownerId: zone.ownerId, zoneId: zone.id });
    return { ok: true };
  }
  const enteringFaceDownBattlefield = zone?.type === ZONE.BATTLEFIELD && nextCard.faceDown;
  const publicCard = enteringFaceDownBattlefield
    ? stripCardIdentity({
        ...nextCard,
        knownToAll: false,
        revealedToAll: false,
        revealedTo: [],
      })
    : nextCard;
  writeCard(maps, publicCard);
  if (zone) {
    const zoneCardIds = prepared.isCommanderZone
      ? getLiveCommanderZoneCardIds(maps, zone.id, zone.cardIds)
      : zone.cardIds;
    const nextIds = placeCardId(zoneCardIds, nextCard.id, "top");
    writeZone(maps, { ...zone, cardIds: nextIds });
  }
  if (enteringFaceDownBattlefield) {
    hidden.faceDownBattlefield[nextCard.id] = buildCardIdentity(nextCard);
    hidden.faceDownReveals[nextCard.id] = {};
    maps.faceDownRevealsToAll.delete(nextCard.id);
    markHiddenChanged({ ownerId: nextCard.controllerId, zoneId: zone?.id });
  }
  if (nextCard.isToken) {
    pushLogEvent("card.tokenCreate", {
      actorId,
      playerId: nextCard.ownerId,
      tokenName: nextCard.name ?? "Token",
      count: 1,
    });
  }
  return { ok: true };
};

const handleCardCounterAdjust: IntentHandler = ({ actorId, maps, payload, pushLogEvent }) => {
  const cardIdResult = requireNonEmptyStringProp(payload, "cardId", "invalid card");
  if (!cardIdResult.ok) return cardIdResult;
  const cardId = cardIdResult.value;
  const card = readCard(maps, cardId);
  if (!card) return { ok: false, error: "card not found" };
  const zone = readZone(maps, card.zoneId);
  if (!zone) return { ok: false, error: "zone not found" };
  const permission = canModifyCardState(actorId, card, zone);
  const allowed = ensurePermission(permission);
  if (!allowed.ok) return allowed;

  if (isRecord(payload.counter) && typeof payload.counter.type === "string") {
    const counter: Counter = {
      type: payload.counter.type,
      count:
        typeof payload.counter.count === "number" && Number.isFinite(payload.counter.count)
          ? Math.floor(payload.counter.count)
          : 0,
      ...(typeof payload.counter.color === "string" ? { color: payload.counter.color } : null),
    };
    const nextCounters = mergeCounters(card.counters, counter);
    const prevCount = card.counters.find((entry) => entry.type === counter.type)?.count ?? 0;
    const nextCount =
      nextCounters.find((entry) => entry.type === counter.type)?.count ?? prevCount;
    const delta = nextCount - prevCount;
    if (delta > 0) {
      pushLogEvent("counter.add", {
        actorId,
        cardId,
        zoneId: card.zoneId,
        counterType: counter.type,
        delta,
        newTotal: nextCount,
        cardName: card.name,
      });
    }
    writeCard(maps, { ...card, counters: nextCounters });
    return { ok: true };
  }

  const counterType = readNonEmptyString(payload.counterType);
  const delta = readNumber(payload.delta) ?? -1;
  if (!counterType) return { ok: false, error: "invalid counter update" };
  const nextCounters = decrementCounter(card.counters, counterType, delta);
  const prevCount = card.counters.find((entry) => entry.type === counterType)?.count ?? 0;
  const nextCount = nextCounters.find((entry) => entry.type === counterType)?.count ?? 0;
  const appliedDelta = nextCount - prevCount;
  if (appliedDelta !== 0) {
    pushLogEvent(appliedDelta > 0 ? "counter.add" : "counter.remove", {
      actorId,
      cardId,
      zoneId: card.zoneId,
      counterType,
      delta: appliedDelta,
      newTotal: nextCount,
      cardName: card.name,
    });
  }
  writeCard(maps, { ...card, counters: nextCounters });
  return { ok: true };
};

const handleCardTap: IntentHandler = ({ actorId, maps, payload, pushLogEvent }) => {
  const cardIdResult = requireNonEmptyStringProp(payload, "cardId", "invalid tap");
  if (!cardIdResult.ok) return cardIdResult;
  const tapped = readBoolean(payload.tapped);
  if (tapped === undefined) return { ok: false, error: "invalid tap" };
  const card = readCard(maps, cardIdResult.value);
  if (!card) return { ok: false, error: "card not found" };
  const zone = readZone(maps, card.zoneId);
  const permission = canTapCard(actorId, card, zone);
  const allowed = ensurePermission(permission);
  if (!allowed.ok) return allowed;
  pushLogEvent("card.tap", {
    actorId,
    cardId: card.id,
    zoneId: card.zoneId,
    tapped,
    cardName: card.name,
  });
  writeCard(maps, { ...card, tapped });
  return { ok: true };
};

const handleCardUntapAll: IntentHandler = ({ actorId, maps, payload, pushLogEvent }) => {
  const playerIdResult = requireNonEmptyStringProp(payload, "playerId", "invalid player");
  if (!playerIdResult.ok) return playerIdResult;
  const playerId = playerIdResult.value;
  if (playerId !== actorId) {
    return { ok: false, error: "actor mismatch" };
  }
  pushLogEvent("card.untapAll", {
    actorId,
    playerId,
  });
  maps.cards.forEach((value, key) => {
    const raw = readRecord(value);
    if (!raw) return;
    const card = raw as unknown as Card;
    if (card.controllerId === playerId && card.tapped) {
      maps.cards.set(String(key), { ...card, tapped: false });
    }
  });
  return { ok: true };
};

const handleCardAdd: IntentHandler = ({ actorId, maps, hidden, payload, pushLogEvent, markHiddenChanged }) => {
  const prepared = prepareCardAdd(actorId, maps, payload.card);
  if ("error" in prepared) return { ok: false, error: prepared.error };
  return applyPreparedCardAdd(actorId, maps, hidden, prepared, pushLogEvent, markHiddenChanged);
};

const handleCardAddBatch: IntentHandler = ({ actorId, maps, hidden, payload, pushLogEvent, markHiddenChanged }) => {
  const cardsResult = requireArrayProp(payload, "cards", "invalid cards");
  if (!cardsResult.ok || cardsResult.value.length === 0) {
    return { ok: false, error: "invalid cards" };
  }
  const prepared: PreparedCardAdd[] = [];
  const pendingCommanderAddsByZone = new Map<string, number>();
  for (const raw of cardsResult.value) {
    const next = prepareCardAdd(actorId, maps, raw, {
      pendingCommanderAddsByZone,
    });
    if ("error" in next) return { ok: false, error: next.error };
    prepared.push(next);
    if (next.isCommanderZone) {
      pendingCommanderAddsByZone.set(
        next.zoneId,
        (pendingCommanderAddsByZone.get(next.zoneId) ?? 0) + 1
      );
    }
  }
  for (const entry of prepared) {
    const result = applyPreparedCardAdd(actorId, maps, hidden, entry, pushLogEvent, markHiddenChanged);
    if (!result.ok) return result;
  }
  return { ok: true };
};

const handleCardRemove: IntentHandler = ({ actorId, maps, hidden, payload, pushLogEvent, markHiddenChanged }) => {
  const cardIdResult = requireNonEmptyStringProp(payload, "cardId", "invalid card");
  if (!cardIdResult.ok) return cardIdResult;
  const cardId = cardIdResult.value;
  const card = readCard(maps, cardId);
  if (card) {
    const zone = readZone(maps, card.zoneId);
    if (!zone) return { ok: false, error: "zone not found" };
    const permission = canRemoveToken(actorId, card, zone);
    const allowed = ensurePermission(permission);
    if (!allowed.ok) return allowed;
    if (zone) {
      const nextIds = removeFromArray(zone.cardIds, cardId);
      writeZone(maps, { ...zone, cardIds: nextIds });
    }
    pushLogEvent("card.remove", {
      actorId,
      cardId,
      zoneId: card.zoneId,
      cardName: card.name,
    });
    maps.cards.delete(cardId);
    const hadFaceDown =
      Boolean(hidden.faceDownBattlefield[cardId]) || Boolean(hidden.faceDownReveals[cardId]);
    clearFaceDownStateForCard(maps, hidden, cardId);
    if (hadFaceDown) {
      markHiddenChanged({ ownerId: card.controllerId, zoneId: card.zoneId });
    }
    return { ok: true };
  }
  const hiddenCard = hidden.cards[cardId];
  if (!hiddenCard) return { ok: false, error: "card not found" };
  const hiddenZone = readZone(maps, hiddenCard.zoneId);
  if (!hiddenZone) return { ok: false, error: "zone not found" };
  const hiddenPermission = canRemoveToken(actorId, hiddenCard, hiddenZone);
  const hiddenAllowed = ensurePermission(hiddenPermission);
  if (!hiddenAllowed.ok) return hiddenAllowed;
  if (hiddenZone.type === ZONE.HAND) {
    const nextOrder = removeFromArray(hidden.handOrder[hiddenZone.ownerId] ?? [], cardId);
    hidden.handOrder[hiddenZone.ownerId] = nextOrder;
    writeZone(maps, { ...hiddenZone, cardIds: nextOrder });
  } else if (hiddenZone.type === ZONE.LIBRARY) {
    hidden.libraryOrder[hiddenZone.ownerId] = removeFromArray(
      hidden.libraryOrder[hiddenZone.ownerId] ?? [],
      cardId
    );
    syncLibraryRevealsToAllForPlayer(maps, hidden, hiddenZone.ownerId, hiddenZone.id);
  } else if (hiddenZone.type === ZONE.SIDEBOARD) {
    hidden.sideboardOrder[hiddenZone.ownerId] = removeFromArray(
      hidden.sideboardOrder[hiddenZone.ownerId] ?? [],
      cardId
    );
  }
  Reflect.deleteProperty(hidden.cards, cardId);
  Reflect.deleteProperty(hidden.handReveals, cardId);
  Reflect.deleteProperty(hidden.libraryReveals, cardId);
  maps.handRevealsToAll.delete(cardId);
  maps.libraryRevealsToAll.delete(cardId);
  updatePlayerCounts(maps, hidden, hiddenCard.ownerId);
  pushLogEvent("card.remove", {
    actorId,
    cardId,
    zoneId: hiddenCard.zoneId,
    cardName: "a card",
  });
  markHiddenChanged({
    ownerId: hiddenCard.ownerId,
    zoneId: hiddenZone.id,
    reveal: { toAll: true },
  });
  return { ok: true };
};

const handleCardUpdate: IntentHandler = ({ actorId, maps, hidden, payload, pushLogEvent, markHiddenChanged }) => {
  const cardIdResult = requireNonEmptyStringProp(payload, "cardId", "invalid update");
  if (!cardIdResult.ok) return cardIdResult;
  const updatesResult = requireRecordProp(payload, "updates", "invalid update");
  if (!updatesResult.ok) return updatesResult;
  const cardId = cardIdResult.value;
  const updates = updatesResult.value;
  const card = readCard(maps, cardId);
  if (!card) return { ok: false, error: "card not found" };
  const zone = readZone(maps, card.zoneId);
  if (!zone) return { ok: false, error: "zone not found" };

  const forbiddenKeys = [
    "name",
    "imageUrl",
    "oracleText",
    "typeLine",
    "scryfallId",
    "scryfall",
    "deckSection",
    "zoneId",
    "position",
    "counters",
    "ownerId",
    "controllerId",
    "id",
    "tapped",
    "knownToAll",
    "revealedToAll",
    "revealedTo",
    "isToken",
  ];
  for (const key of forbiddenKeys) {
    if (Object.prototype.hasOwnProperty.call(updates, key)) {
      return { ok: false, error: "unsupported update" };
    }
  }

  if (Object.prototype.hasOwnProperty.call(updates, "isCommander")) {
    if (card.ownerId !== actorId) {
      return { ok: false, error: "Only owner may update commander status" };
    }
  }
  if (Object.prototype.hasOwnProperty.call(updates, "commanderTax")) {
    if (card.ownerId !== actorId) {
      return { ok: false, error: "Only owner may update commander tax" };
    }
  }

  const controlledFields = [
    "power",
    "toughness",
    "basePower",
    "baseToughness",
    "customText",
    "faceDown",
    "faceDownMode",
    "currentFaceIndex",
    "rotation",
  ];
  const requiresControl = controlledFields.some((key) =>
    Object.prototype.hasOwnProperty.call(updates, key)
  );
  if (requiresControl) {
    const permission = canModifyCardState(actorId, card, zone);
    const allowed = ensurePermission(permission);
    if (!allowed.ok) return allowed;
  }
  const nextCard = applyCardUpdates(card, updates, zone?.type);
  const flippedFaceUp =
    zone?.type === ZONE.BATTLEFIELD && card.faceDown && !nextCard.faceDown;
  const faceDownIdentity = flippedFaceUp ? hidden.faceDownBattlefield[card.id] : undefined;
  let publicCard = nextCard;
  if (zone?.type === ZONE.BATTLEFIELD) {
    if (!card.faceDown && nextCard.faceDown) {
      hidden.faceDownBattlefield[card.id] = buildCardIdentity(nextCard);
      hidden.faceDownReveals[card.id] = {};
      maps.faceDownRevealsToAll.delete(card.id);
      markHiddenChanged({ ownerId: nextCard.controllerId, zoneId: card.zoneId });
      publicCard = stripCardIdentity({
        ...nextCard,
        knownToAll: false,
        revealedToAll: false,
        revealedTo: [],
      });
    } else if (card.faceDown && !nextCard.faceDown) {
      const identity = faceDownIdentity;
      Reflect.deleteProperty(hidden.faceDownBattlefield, card.id);
      Reflect.deleteProperty(hidden.faceDownReveals, card.id);
      maps.faceDownRevealsToAll.delete(card.id);
      markHiddenChanged({ ownerId: card.controllerId, zoneId: card.zoneId });
      publicCard = mergeCardIdentity(nextCard, identity);
    } else if (nextCard.faceDown) {
      publicCard = stripCardIdentity(nextCard);
    }
  }
  if (flippedFaceUp) {
    pushLogEvent("card.faceUp", {
      actorId,
      cardId,
      zoneId: card.zoneId,
      ...(faceDownIdentity?.name ? { cardName: faceDownIdentity.name } : {}),
    });
  }
  const newPower = (updates as Record<string, unknown>).power ?? card.power;
  const newToughness = (updates as Record<string, unknown>).toughness ?? card.toughness;
  const powerChanged = newPower !== card.power;
  const toughnessChanged = newToughness !== card.toughness;
  if (
    (powerChanged || toughnessChanged) &&
    (newPower !== undefined || newToughness !== undefined)
  ) {
    pushLogEvent("card.pt", {
      actorId,
      cardId,
      zoneId: card.zoneId,
      fromPower: card.power,
      fromToughness: card.toughness,
      toPower: newPower ?? card.power,
      toToughness: newToughness ?? card.toughness,
      cardName: card.name,
    });
  }
  const commanderTaxBefore = card.commanderTax ?? 0;
  const commanderTaxAfter = nextCard.commanderTax ?? 0;
  if (commanderTaxBefore !== commanderTaxAfter) {
    pushLogEvent("player.commanderTax", {
      actorId,
      playerId: card.ownerId,
      cardId: card.id,
      zoneId: card.zoneId,
      cardName: card.name,
      from: commanderTaxBefore,
      to: commanderTaxAfter,
      delta: commanderTaxAfter - commanderTaxBefore,
    });
  }
  writeCard(maps, publicCard);
  return { ok: true };
};

const handleCardTransform: IntentHandler = ({ actorId, maps, hidden, payload, pushLogEvent, markHiddenChanged }) => {
  const cardIdResult = requireNonEmptyStringProp(payload, "cardId", "invalid card");
  if (!cardIdResult.ok) return cardIdResult;
  const cardId = cardIdResult.value;
  const faceIndex = readNumber(payload.targetIndex);
  const card = readCard(maps, cardId);
  if (!card) return { ok: false, error: "card not found" };
  const zone = readZone(maps, card.zoneId);
  if (!zone) return { ok: false, error: "zone not found" };
  const permission = canModifyCardState(actorId, card, zone);
  const allowed = ensurePermission(permission);
  if (!allowed.ok) return allowed;
  if (!isTransformableCard(card)) return { ok: true };
  const { targetIndex, toFaceName } = computeTransformTargetIndex(card, faceIndex);
  const faces = getCardFaces(card);
  const fromFaceName = faces[getCurrentFaceIndex(card)]?.name;
  const verb = card.scryfall?.layout === "flip" ? "flipped" : "transformed";
  pushLogEvent("card.transform", {
    actorId,
    cardId,
    zoneId: card.zoneId,
    fromFaceName,
    toFaceName,
    cardName: fromFaceName ?? card.name,
    verb,
  });
  const cardForTransform = card.faceDown
    ? mergeCardIdentity(card, hidden.faceDownBattlefield[card.id])
    : card;
  const nextCard = syncCardStatsToFace(cardForTransform, targetIndex);
  if (card.faceDown) {
    hidden.faceDownBattlefield[card.id] = buildCardIdentity(nextCard);
    markHiddenChanged({ ownerId: card.controllerId, zoneId: card.zoneId });
    writeCard(maps, stripCardIdentity(nextCard));
  } else {
    writeCard(maps, nextCard);
  }
  return { ok: true };
};

const handleCardRevealSet: IntentHandler = ({ actorId, maps, hidden, payload, markHiddenChanged }) => {
  const cardIdResult = requireNonEmptyStringProp(payload, "cardId", "invalid card");
  if (!cardIdResult.ok) return cardIdResult;
  const cardId = cardIdResult.value;
  const reveal =
    readRecordValue(payload.reveal) || payload.reveal === null
      ? (payload.reveal as { toAll?: boolean; to?: string[] } | null)
      : null;
  const hiddenCard = hidden.cards[cardId];
  if (!hiddenCard) {
    const publicCard = readCard(maps, cardId);
    if (!publicCard) return { ok: false, error: "card not found" };
    const zone = readZone(maps, publicCard.zoneId);
    if (!zone) return { ok: false, error: "zone not found" };
    if (zone.type !== ZONE.BATTLEFIELD || !publicCard.faceDown) {
      return { ok: true };
    }
    if (publicCard.controllerId !== actorId) {
      return { ok: false, error: "Only controller may reveal this card" };
    }
    const prevReveal = hidden.faceDownReveals[cardId];
    const patch = buildRevealPatch(publicCard, reveal, { excludeId: actorId });
    if (!reveal) {
      Reflect.deleteProperty(hidden.faceDownReveals, cardId);
      maps.faceDownRevealsToAll.delete(cardId);
      markHiddenChanged({
        ownerId: publicCard.controllerId,
        zoneId: publicCard.zoneId,
        ...(prevReveal ? { prevReveal } : null),
      });
      return { ok: true };
    }
    const toPlayers = patch.revealedTo ?? [];
    const revealState = {
      ...(patch.revealedToAll ? { toAll: true } : null),
      ...(toPlayers.length ? { toPlayers } : null),
    };
    hidden.faceDownReveals[cardId] = revealState;
    if (patch.revealedToAll) {
      const identity = hidden.faceDownBattlefield[cardId];
      if (identity) {
        maps.faceDownRevealsToAll.set(cardId, identity);
      } else {
        maps.faceDownRevealsToAll.delete(cardId);
      }
    } else {
      maps.faceDownRevealsToAll.delete(cardId);
    }
    markHiddenChanged({
      ownerId: publicCard.controllerId,
      zoneId: publicCard.zoneId,
      reveal: revealState,
      ...(prevReveal ? { prevReveal } : null),
    });
    return { ok: true };
  }
  if (hiddenCard.ownerId !== actorId) {
    return { ok: false, error: "Only owner may reveal this card" };
  }
  const zone = readZone(maps, hiddenCard.zoneId);
  if (!zone) return { ok: false, error: "zone not found" };
  if (zone.type !== ZONE.HAND && zone.type !== ZONE.LIBRARY) {
    return { ok: true };
  }
  const prevReveal =
    zone.type === ZONE.HAND
      ? hidden.handReveals[cardId]
      : zone.type === ZONE.LIBRARY
        ? hidden.libraryReveals[cardId]
        : undefined;
  const patch = buildRevealPatch(hiddenCard, reveal);
  if (!reveal) {
    if (zone.type === ZONE.HAND) {
      Reflect.deleteProperty(hidden.handReveals, cardId);
      maps.handRevealsToAll.delete(cardId);
    } else if (zone.type === ZONE.LIBRARY) {
      Reflect.deleteProperty(hidden.libraryReveals, cardId);
      maps.libraryRevealsToAll.delete(cardId);
      syncLibraryRevealsToAllForPlayer(maps, hidden, zone.ownerId, zone.id);
    }
    markHiddenChanged({
      ownerId: hiddenCard.ownerId,
      zoneId: zone.id,
      ...(prevReveal ? { prevReveal } : null),
    });
    return { ok: true };
  }
  const toPlayers = patch.revealedTo ?? [];
  const revealState = {
    ...(patch.revealedToAll ? { toAll: true } : null),
    ...(toPlayers.length ? { toPlayers } : null),
  };
  if (zone.type === ZONE.HAND) {
    hidden.handReveals[cardId] = revealState;
    if (patch.revealedToAll) {
      maps.handRevealsToAll.set(cardId, buildCardIdentity(hiddenCard));
    } else {
      maps.handRevealsToAll.delete(cardId);
    }
  } else if (zone.type === ZONE.LIBRARY) {
    hidden.libraryReveals[cardId] = revealState;
    if (patch.revealedToAll) {
      const order = hidden.libraryOrder[zone.ownerId] ?? [];
      const index = order.indexOf(cardId);
      maps.libraryRevealsToAll.set(cardId, {
        card: buildCardIdentity(hiddenCard),
        orderKey: buildLibraryOrderKey(index >= 0 ? index : order.length),
        ownerId: hiddenCard.ownerId,
      });
    } else {
      maps.libraryRevealsToAll.delete(cardId);
    }
    syncLibraryRevealsToAllForPlayer(maps, hidden, zone.ownerId, zone.id);
  }
  markHiddenChanged({
    ownerId: hiddenCard.ownerId,
    zoneId: zone.id,
    reveal: revealState,
    ...(prevReveal ? { prevReveal } : null),
  });
  return { ok: true };
};

const handleCardDuplicate: IntentHandler = ({ actorId, maps, payload, pushLogEvent }) => {
  const cardIdResult = requireNonEmptyStringProp(payload, "cardId", "invalid duplicate");
  if (!cardIdResult.ok) return cardIdResult;
  const newCardIdResult = requireNonEmptyStringProp(payload, "newCardId", "invalid duplicate");
  if (!newCardIdResult.ok) return newCardIdResult;
  const card = readCard(maps, cardIdResult.value);
  if (!card) return { ok: false, error: "card not found" };
  const zone = readZone(maps, card.zoneId);
  if (!zone) return { ok: false, error: "zone not found" };
  const permission = canModifyCardState(actorId, card, zone);
  const allowed = ensurePermission(permission);
  if (!allowed.ok) return allowed;
  const cardsById: Record<string, { position: Card["position"] }> = {};
  zone.cardIds.forEach((id) => {
    const raw = readRecord(maps.cards.get(id));
    if (!raw) return;
    const position = (raw as { position?: { x?: unknown; y?: unknown } }).position;
    if (!position || typeof position.x !== "number" || typeof position.y !== "number") return;
    cardsById[id] = { position: { x: position.x, y: position.y } };
  });
  const position = computeDuplicateTokenPosition({
    sourceCard: card,
    orderedCardIds: zone.cardIds,
    cardsById,
  });
  const clone = buildDuplicateTokenCard({
    sourceCard: card,
    newCardId: newCardIdResult.value,
    position,
  });
  writeCard(maps, clone);
  const nextIds = placeCardId(zone.cardIds, clone.id, "top");
  writeZone(maps, { ...zone, cardIds: nextIds });
  pushLogEvent("card.duplicate", {
    actorId,
    sourceCardId: card.id,
    newCardId: clone.id,
    zoneId: zone.id,
    cardName: card.name,
  });
  return { ok: true };
};

const handleCardMove: IntentHandler = ({ actorId, maps, hidden, payload, pushLogEvent, markHiddenChanged }) => {
  const cardIdResult = requireNonEmptyStringProp(payload, "cardId", "invalid move");
  if (!cardIdResult.ok) return cardIdResult;
  const toZoneIdResult = requireNonEmptyStringProp(payload, "toZoneId", "invalid move");
  if (!toZoneIdResult.ok) return toZoneIdResult;
  const toZone = readZone(maps, toZoneIdResult.value);
  if (!toZone) return { ok: false, error: "zone not found" };
  const publicCard = readCard(maps, cardIdResult.value);
  const hiddenCard = !publicCard ? hidden.cards[cardIdResult.value] : null;
  const card = publicCard ?? hiddenCard;
  if (!card) return { ok: false, error: "card not found" };
  const fromZone = readZone(maps, card.zoneId);
  if (!fromZone) return { ok: false, error: "zone not found" };
  const permission = canMoveCard(actorId, card, fromZone, toZone);
  const allowed = ensurePermission(permission);
  if (!allowed.ok) return allowed;
  const placement =
    typeof payload.placement === "string" &&
    (payload.placement === "bottom" || payload.placement === "top")
      ? payload.placement
      : "top";
  return applyCardMove(maps, hidden, payload, placement, pushLogEvent, markHiddenChanged);
};

export const cardIntentHandlers: Record<string, IntentHandler> = {
  "card.counter.adjust": handleCardCounterAdjust,
  "card.tap": handleCardTap,
  "card.untapAll": handleCardUntapAll,
  "card.add": handleCardAdd,
  "card.add.batch": handleCardAddBatch,
  "card.remove": handleCardRemove,
  "card.update": handleCardUpdate,
  "card.transform": handleCardTransform,
  "card.reveal.set": handleCardRevealSet,
  "card.duplicate": handleCardDuplicate,
  "card.move": handleCardMove,
};
