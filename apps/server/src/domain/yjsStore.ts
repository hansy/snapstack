import * as Y from "yjs";

import type { Card } from "@mtg/shared/types/cards";
import type { Player } from "@mtg/shared/types/players";
import type { Zone } from "@mtg/shared/types/zones";

import type { Maps, Snapshot } from "./types";

export const getMaps = (doc: Y.Doc): Maps => ({
  players: doc.getMap("players"),
  playerOrder: doc.getArray("playerOrder"),
  zones: doc.getMap("zones"),
  cards: doc.getMap("cards"),
  zoneCardOrders: doc.getMap("zoneCardOrders"),
  globalCounters: doc.getMap("globalCounters"),
  battlefieldViewScale: doc.getMap("battlefieldViewScale"),
  meta: doc.getMap("meta"),
  handRevealsToAll: doc.getMap("handRevealsToAll"),
  libraryRevealsToAll: doc.getMap("libraryRevealsToAll"),
  faceDownRevealsToAll: doc.getMap("faceDownRevealsToAll"),
});

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const toPlain = (value: unknown): unknown => {
  if (value instanceof Y.Map || value instanceof Y.Array) return value.toJSON();
  return value;
};

export const readRecord = (value: unknown): Record<string, unknown> | null => {
  const plain = toPlain(value);
  return isRecord(plain) ? plain : null;
};

export const uniqueStrings = (values: unknown[]): string[] =>
  Array.from(new Set(values.filter((value): value is string => typeof value === "string")));

export const readZoneCardIds = (maps: Maps, zoneId: string, zone?: Zone): string[] => {
  const order = maps.zoneCardOrders.get(zoneId);
  if (order instanceof Y.Array) {
    return uniqueStrings(order.toArray());
  }
  return uniqueStrings(zone?.cardIds ?? []);
};

export const syncZoneOrder = (maps: Maps, zoneId: string, ids: string[]) => {
  const unique = uniqueStrings(ids);
  const order = maps.zoneCardOrders.get(zoneId);
  if (order instanceof Y.Array) {
    order.delete(0, order.length);
    if (unique.length) order.insert(0, unique);
    return;
  }
  const next = new Y.Array<string>();
  if (unique.length) next.insert(0, unique);
  maps.zoneCardOrders.set(zoneId, next);
};

export const readZone = (maps: Maps, zoneId: string): Zone | null => {
  const raw = readRecord(maps.zones.get(zoneId));
  if (!raw) return null;
  const zone = raw as unknown as Zone;
  const cardIds = readZoneCardIds(maps, zoneId, zone);
  return { ...zone, id: zoneId, cardIds };
};

export const readCard = (maps: Maps, cardId: string): Card | null => {
  const raw = readRecord(maps.cards.get(cardId));
  if (!raw) return null;
  return { ...(raw as unknown as Card), id: cardId };
};

export const readPlayer = (maps: Maps, playerId: string): Player | null => {
  const raw = readRecord(maps.players.get(playerId));
  if (!raw) return null;
  return { ...(raw as unknown as Player), id: playerId };
};

export const writeZone = (maps: Maps, zone: Zone) => {
  const cardIds = uniqueStrings(zone.cardIds ?? []);
  maps.zones.set(zone.id, { ...zone, cardIds });
  syncZoneOrder(maps, zone.id, cardIds);
};

export const writeCard = (maps: Maps, card: Card) => {
  maps.cards.set(card.id, card);
};

export const writePlayer = (maps: Maps, player: Player) => {
  maps.players.set(player.id, player);
  const order = maps.playerOrder;
  if (!order.toArray().includes(player.id)) {
    order.push([player.id]);
  }
};

export const buildSnapshot = (maps: Maps): Snapshot => {
  const players: Record<string, Player> = {};
  const zones: Record<string, Zone> = {};
  const cards: Record<string, Card> = {};
  const globalCounters: Record<string, string> = {};
  const battlefieldViewScale: Record<string, number> = {};
  const meta: Record<string, unknown> = {};

  maps.players.forEach((value, key) => {
    const raw = readRecord(value);
    if (!raw) return;
    players[String(key)] = { ...(raw as unknown as Player), id: String(key) };
  });

  maps.zones.forEach((value, key) => {
    const raw = readRecord(value);
    if (!raw) return;
    const zoneId = String(key);
    const zone = raw as unknown as Zone;
    zones[zoneId] = { ...zone, id: zoneId, cardIds: readZoneCardIds(maps, zoneId, zone) };
  });

  maps.cards.forEach((value, key) => {
    const raw = readRecord(value);
    if (!raw) return;
    cards[String(key)] = { ...(raw as unknown as Card), id: String(key) };
  });

  maps.globalCounters.forEach((value, key) => {
    if (typeof value === "string") globalCounters[String(key)] = value;
  });

  maps.battlefieldViewScale.forEach((value, key) => {
    if (typeof value === "number" && Number.isFinite(value)) {
      battlefieldViewScale[String(key)] = value;
    }
  });

  maps.meta.forEach((value, key) => {
    if (typeof key === "string") meta[key] = value;
  });

  const playerOrder = maps.playerOrder
    .toArray()
    .filter((id): id is string => typeof id === "string");

  return { players, zones, cards, globalCounters, battlefieldViewScale, meta, playerOrder };
};

export const applyRecordToMap = (map: Y.Map<unknown>, next: Record<string, unknown>) => {
  const seen = new Set(Object.keys(next));
  map.forEach((_value, key) => {
    const keyStr = String(key);
    if (!seen.has(keyStr)) map.delete(keyStr);
  });
  Object.entries(next).forEach(([key, value]) => {
    map.set(key, value);
  });
};

export const clearYMap = <T>(map: Y.Map<T>) => {
  map.forEach((_value, key) => {
    map.delete(key);
  });
};

export const syncPlayerOrder = (order: Y.Array<string>, ids: string[]) => {
  order.delete(0, order.length);
  if (ids.length) order.insert(0, ids);
};

export const resolveNextHostId = (players: Record<string, Player>, order: string[]): string | null => {
  for (const id of order) {
    if (players[id]) return id;
  }
  const fallback = Object.keys(players).sort()[0];
  return fallback ?? null;
};
