import type { Card, CardIdentity } from "../../../web/src/types/cards";
import type { Zone } from "../../../web/src/types/zones";

import { isHiddenZoneType, ZONE, MAX_HIDDEN_STATE_CHUNK_SIZE, MAX_REVEALED_TO } from "./constants";
import type { HiddenReveal, HiddenState, Maps } from "./types";
import {
  buildSnapshot,
  clearYMap,
  readPlayer,
  readRecord,
  uniqueStrings,
  writeCard,
  writePlayer,
  writeZone,
} from "./yjsStore";
import { buildCardIdentity, stripCardIdentity } from "./cards";

export const createEmptyHiddenState = (): HiddenState => ({
  cards: {},
  handOrder: {},
  libraryOrder: {},
  sideboardOrder: {},
  faceDownBattlefield: {},
  handReveals: {},
  libraryReveals: {},
  faceDownReveals: {},
});

const readOrderMap = (value: unknown): Record<string, string[]> => {
  if (!value || typeof value !== "object") return {};
  const result: Record<string, string[]> = {};
  Object.entries(value as Record<string, unknown>).forEach(([key, raw]) => {
    if (!Array.isArray(raw)) return;
    result[key] = uniqueStrings(raw);
  });
  return result;
};

const readRevealMap = (value: unknown): Record<string, HiddenReveal> => {
  if (!value || typeof value !== "object") return {};
  const result: Record<string, HiddenReveal> = {};
  Object.entries(value as Record<string, unknown>).forEach(([key, raw]) => {
    if (!raw || typeof raw !== "object") return;
    const toAll = (raw as HiddenReveal).toAll === true;
    const toPlayers = Array.isArray((raw as HiddenReveal).toPlayers)
      ? uniqueStrings((raw as HiddenReveal).toPlayers ?? [])
      : [];
    result[key] = {
      ...(toAll ? { toAll: true } : null),
      ...(toPlayers.length ? { toPlayers } : null),
    };
  });
  return result;
};

export const normalizeHiddenState = (value: unknown): HiddenState => {
  if (!value || typeof value !== "object") return createEmptyHiddenState();
  const record = value as Record<string, unknown>;
  const cards = record.cards && typeof record.cards === "object" ? (record.cards as Record<string, Card>) : {};
  const faceDownBattlefield =
    record.faceDownBattlefield && typeof record.faceDownBattlefield === "object"
      ? (record.faceDownBattlefield as Record<string, CardIdentity>)
      : {};
  return {
    cards,
    handOrder: readOrderMap(record.handOrder),
    libraryOrder: readOrderMap(record.libraryOrder),
    sideboardOrder: readOrderMap(record.sideboardOrder),
    faceDownBattlefield,
    handReveals: readRevealMap(record.handReveals),
    libraryReveals: readRevealMap(record.libraryReveals),
    faceDownReveals: readRevealMap(record.faceDownReveals),
  };
};

const estimateJsonSize = (value: unknown): number => {
  try {
    return JSON.stringify(value).length;
  } catch (_err) {
    return Number.POSITIVE_INFINITY;
  }
};

export const chunkHiddenCards = (cards: Record<string, Card>): Record<string, Card>[] => {
  const entries = Object.entries(cards);
  if (entries.length === 0) return [];
  const chunks: Record<string, Card>[] = [];
  let current: Record<string, Card> = {};

  entries.forEach(([cardId, card]) => {
    const next = { ...current, [cardId]: card };
    if (Object.keys(current).length > 0 && estimateJsonSize(next) > MAX_HIDDEN_STATE_CHUNK_SIZE) {
      chunks.push(current);
      current = { [cardId]: card };
      return;
    }
    current = next;
  });

  if (Object.keys(current).length) {
    chunks.push(current);
  }
  return chunks;
};

export const buildLibraryOrderKey = (index: number) => String(index).padStart(6, "0");

export const extractReveal = (card: Card): HiddenReveal => {
  const reveal: HiddenReveal = {};
  if (card.revealedToAll) {
    reveal.toAll = true;
  }
  const toPlayers = Array.isArray(card.revealedTo) ? uniqueStrings(card.revealedTo) : [];
  if (toPlayers.length) {
    reveal.toPlayers = toPlayers;
  }
  return reveal;
};

export const buildRevealPatch = (
  card: Card,
  reveal: { toAll?: boolean; to?: string[] } | null
): Pick<Card, "revealedToAll" | "revealedTo"> => {
  if (!reveal) {
    return { revealedToAll: false, revealedTo: [] };
  }

  if (reveal.toAll) {
    return { revealedToAll: true, revealedTo: [] };
  }

  const to = Array.isArray(reveal.to)
    ? reveal.to.filter((id) => typeof id === "string" && id !== card.ownerId)
    : [];
  const unique = Array.from(new Set(to));

  return { revealedToAll: false, revealedTo: unique.slice(0, MAX_REVEALED_TO) };
};

export const applyRevealToCard = (card: Card, reveal?: HiddenReveal): Card => {
  const revealedToAll = reveal?.toAll === true;
  const revealedTo = Array.isArray(reveal?.toPlayers) ? reveal?.toPlayers ?? [] : [];
  return {
    ...card,
    revealedToAll,
    revealedTo: revealedTo.length ? revealedTo : [],
  };
};

export const updatePlayerCounts = (maps: Maps, hidden: HiddenState, playerId: string) => {
  const player = readPlayer(maps, playerId);
  if (!player) return;
  const handCount = hidden.handOrder[playerId]?.length ?? 0;
  const libraryCount = hidden.libraryOrder[playerId]?.length ?? 0;
  const sideboardCount = hidden.sideboardOrder[playerId]?.length ?? 0;
  writePlayer(maps, { ...player, handCount, libraryCount, sideboardCount });
};

export const clearFaceDownStateForCard = (maps: Maps, hidden: HiddenState, cardId: string) => {
  Reflect.deleteProperty(hidden.faceDownBattlefield, cardId);
  Reflect.deleteProperty(hidden.faceDownReveals, cardId);
  maps.faceDownRevealsToAll.delete(cardId);
};

export const syncLibraryRevealsToAllForPlayer = (
  maps: Maps,
  hidden: HiddenState,
  playerId: string,
  libraryZoneId?: string
) => {
  const player = readPlayer(maps, playerId);
  if (!player) return;
  const order = hidden.libraryOrder[playerId] ?? [];
  const libraryCardIds = new Set(order);
  const toAllIds = new Set<string>();
  const topCardId = order.length ? order[order.length - 1] : null;

  order.forEach((cardId) => {
    if (hidden.libraryReveals[cardId]?.toAll) {
      toAllIds.add(cardId);
    }
  });

  if (player.libraryTopReveal === "all" && topCardId) {
    toAllIds.add(topCardId);
  }

  let resolvedLibraryZoneId = libraryZoneId;
  if (!resolvedLibraryZoneId) {
    maps.zones.forEach((value, key) => {
      const raw = readRecord(value);
      if (!raw) return;
      const zone = raw as Zone;
      if (zone.ownerId === playerId && zone.type === ZONE.LIBRARY) {
        resolvedLibraryZoneId = String(key);
      }
    });
  }

  maps.libraryRevealsToAll.forEach((value, key) => {
    const cardId = String(key);
    if (libraryCardIds.has(cardId)) {
      if (!toAllIds.has(cardId)) {
        maps.libraryRevealsToAll.delete(cardId);
      }
      return;
    }
    const entry = readRecord(value);
    const entryOwnerId = entry && typeof entry.ownerId === "string" ? entry.ownerId : undefined;
    if (entryOwnerId && entryOwnerId === playerId) {
      maps.libraryRevealsToAll.delete(cardId);
      return;
    }
    if (resolvedLibraryZoneId && hidden.cards[cardId]?.zoneId === resolvedLibraryZoneId) {
      maps.libraryRevealsToAll.delete(cardId);
    }
  });

  toAllIds.forEach((cardId) => {
    const card = hidden.cards[cardId];
    if (!card) return;
    const index = order.indexOf(cardId);
    const orderKey = buildLibraryOrderKey(index >= 0 ? index : order.length);
    maps.libraryRevealsToAll.set(cardId, {
      card: buildCardIdentity(card),
      orderKey,
      ownerId: card.ownerId,
    });
  });
};

export const migrateHiddenStateFromSnapshot = (maps: Maps): HiddenState => {
  const snapshot = buildSnapshot(maps);
  const hidden = createEmptyHiddenState();

  Object.values(snapshot.zones).forEach((zone) => {
    if (zone.type === ZONE.HAND) {
      hidden.handOrder[zone.ownerId] = uniqueStrings(zone.cardIds);
    } else if (zone.type === ZONE.LIBRARY) {
      hidden.libraryOrder[zone.ownerId] = uniqueStrings(zone.cardIds);
    } else if (zone.type === ZONE.SIDEBOARD) {
      hidden.sideboardOrder[zone.ownerId] = uniqueStrings(zone.cardIds);
    }
  });

  const handRevealsToAll: Record<string, CardIdentity> = {};
  const libraryRevealsToAll: Record<
    string,
    { card: CardIdentity; orderKey: string; ownerId?: string }
  > = {};
  const faceDownRevealsToAll: Record<string, CardIdentity> = {};

  Object.values(snapshot.cards).forEach((card) => {
    const zone = snapshot.zones[card.zoneId];
    if (zone && isHiddenZoneType(zone.type)) {
      hidden.cards[card.id] = { ...card };
      const reveal = extractReveal(card);
      if (reveal.toAll || (reveal.toPlayers && reveal.toPlayers.length)) {
        if (zone.type === ZONE.HAND) {
          hidden.handReveals[card.id] = reveal;
          if (reveal.toAll) handRevealsToAll[card.id] = buildCardIdentity(card);
        } else if (zone.type === ZONE.LIBRARY) {
          hidden.libraryReveals[card.id] = reveal;
          if (reveal.toAll) {
            const order = hidden.libraryOrder[zone.ownerId] ?? [];
            const index = order.indexOf(card.id);
            const orderKey = buildLibraryOrderKey(index >= 0 ? index : order.length);
            libraryRevealsToAll[card.id] = {
              card: buildCardIdentity(card),
              orderKey,
              ownerId: card.ownerId,
            };
          }
        }
      }
      maps.cards.delete(card.id);
      return;
    }

    let nextCard: Card | null = null;

    if (card.faceDown) {
      hidden.faceDownBattlefield[card.id] = buildCardIdentity(card);
      const reveal = extractReveal(card);
      if (reveal.toAll || (reveal.toPlayers && reveal.toPlayers.length)) {
        hidden.faceDownReveals[card.id] = reveal;
        if (reveal.toAll) {
          faceDownRevealsToAll[card.id] = buildCardIdentity(card);
        }
      }
      nextCard = stripCardIdentity({
        ...card,
        knownToAll: false,
        revealedToAll: false,
        revealedTo: [],
      });
    }

    if (card.revealedToAll || (card.revealedTo && card.revealedTo.length)) {
      nextCard = {
        ...(nextCard ?? card),
        revealedToAll: false,
        revealedTo: [],
      };
    }

    if (nextCard) {
      writeCard(maps, nextCard);
    }
  });

  Object.values(snapshot.zones).forEach((zone) => {
    if (zone.type === ZONE.HAND) {
      writeZone(maps, { ...zone, cardIds: hidden.handOrder[zone.ownerId] ?? [] });
      return;
    }
    if (zone.type === ZONE.LIBRARY || zone.type === ZONE.SIDEBOARD) {
      writeZone(maps, { ...zone, cardIds: [] });
    }
  });

  Object.keys(snapshot.players).forEach((playerId) => {
    updatePlayerCounts(maps, hidden, playerId);
  });

  clearYMap(maps.handRevealsToAll);
  clearYMap(maps.libraryRevealsToAll);
  clearYMap(maps.faceDownRevealsToAll);
  Object.entries(handRevealsToAll).forEach(([cardId, identity]) => {
    maps.handRevealsToAll.set(cardId, identity);
  });
  Object.entries(libraryRevealsToAll).forEach(([cardId, entry]) => {
    maps.libraryRevealsToAll.set(cardId, entry);
  });
  Object.entries(faceDownRevealsToAll).forEach(([cardId, identity]) => {
    maps.faceDownRevealsToAll.set(cardId, identity);
  });

  return hidden;
};
