import type { Card, Counter, Player, Zone } from "../types";
import { enforceZoneCounterRules } from "../lib/counters";
import { clampNormalizedPosition, migratePositionToNormalized } from "../lib/positions";

// Flag to prevent feedback loops: Yjs -> Zustand -> Yjs
let applyingRemoteUpdate = false;

export function isApplyingRemoteUpdate(): boolean {
  return applyingRemoteUpdate;
}

export function withApplyingRemoteUpdate<T>(fn: () => T): T {
  applyingRemoteUpdate = true;
  try {
    return fn();
  } finally {
    applyingRemoteUpdate = false;
  }
}

// Limits for sanitization
// 4-player Commander = 400 base cards + tokens, so 800 gives headroom
const MAX_PLAYERS = 8;
const MAX_ZONES = MAX_PLAYERS * 10; // 80 zones
const MAX_CARDS = 800;
const MAX_CARDS_PER_ZONE = 300;
const MAX_COUNTERS = 24;
const MAX_NAME_LENGTH = 120;

const clampNumber = (value: unknown, min: number, max: number, fallback: number) => {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(Math.max(value, min), max);
};

const normalizePosition = (pos: any) => {
  if (!pos || typeof pos.x !== "number" || typeof pos.y !== "number") {
    return { x: 0.5, y: 0.5 };
  }
  const needsMigration = pos.x > 1 || pos.y > 1;
  const next = needsMigration ? migratePositionToNormalized(pos) : clampNormalizedPosition(pos);
  return { x: next.x, y: next.y };
};

const sanitizeCounters = (value: any): Counter[] => {
  if (!Array.isArray(value)) return [];
  const result: Counter[] = [];
  for (const c of value) {
    if (!c || typeof c.type !== "string") continue;
    const count = clampNumber(c.count, 0, 999, 0);
    const counter: Counter = { type: c.type.slice(0, 64), count };
    if (typeof c.color === "string") counter.color = c.color.slice(0, 32);
    result.push(counter);
    if (result.length >= MAX_COUNTERS) break;
  }
  return result;
};

const sanitizePlayer = (value: any): Player | null => {
  if (!value || typeof value.id !== "string") return null;
  const id = value.id;
  const name =
    typeof value.name === "string" && value.name.trim().length
      ? value.name.slice(0, MAX_NAME_LENGTH)
      : `Player ${id.slice(0, 4)}`;
  const commanderDamage: Record<string, number> = {};
  if (value.commanderDamage && typeof value.commanderDamage === "object") {
    Object.entries(value.commanderDamage).forEach(([pid, dmg]) => {
      if (typeof pid === "string") {
        commanderDamage[pid] = clampNumber(dmg, 0, 999, 0);
      }
    });
  }
  return {
    id,
    name,
    life: clampNumber(value.life, -999, 999, 40),
    color: typeof value.color === "string" ? value.color.slice(0, 16) : undefined,
    cursor:
      value.cursor &&
      typeof value.cursor.x === "number" &&
      typeof value.cursor.y === "number"
        ? { x: value.cursor.x, y: value.cursor.y }
        : undefined,
    counters: sanitizeCounters(value.counters),
    commanderDamage,
    commanderTax: clampNumber(value.commanderTax, 0, 99, 0),
    deckLoaded: Boolean(value.deckLoaded),
  };
};

const sanitizeZone = (value: any): Zone | null => {
  if (!value || typeof value.id !== "string" || typeof value.ownerId !== "string") return null;
  if (!["library", "hand", "battlefield", "graveyard", "exile", "commander"].includes(value.type)) return null;
  const ids: string[] = Array.isArray(value.cardIds)
    ? Array.from(
        new Set<string>((value.cardIds as unknown[]).filter((cardId): cardId is string => typeof cardId === "string"))
      ).slice(0, MAX_CARDS_PER_ZONE)
    : [];
  return {
    id: value.id,
    type: value.type,
    ownerId: value.ownerId,
    cardIds: ids,
  };
};

const sanitizeCard = (value: any, zones: Record<string, Zone>): Card | null => {
  if (!value || typeof value.id !== "string" || typeof value.zoneId !== "string") return null;
  if (!zones[value.zoneId]) return null;
  if (typeof value.ownerId !== "string" || typeof value.controllerId !== "string") return null;

  const counters = sanitizeCounters(value.counters);
  const position = normalizePosition(value.position);
  const rotation = clampNumber(value.rotation, -360, 360, 0);
  const faceIndex =
    typeof value.currentFaceIndex === "number" && Number.isFinite(value.currentFaceIndex)
      ? Math.max(0, Math.floor(value.currentFaceIndex))
      : 0;

  return {
    id: value.id,
    ownerId: value.ownerId,
    controllerId: value.controllerId,
    zoneId: value.zoneId,
    tapped: Boolean(value.tapped),
    faceDown: Boolean(value.faceDown),
    currentFaceIndex: faceIndex,
    position,
    rotation,
    counters,
    name: typeof value.name === "string" ? value.name.slice(0, MAX_NAME_LENGTH) : "Card",
    imageUrl: typeof value.imageUrl === "string" ? value.imageUrl : undefined,
    oracleText: typeof value.oracleText === "string" ? value.oracleText : undefined,
    typeLine: typeof value.typeLine === "string" ? value.typeLine : undefined,
    scryfallId: typeof value.scryfallId === "string" ? value.scryfallId : undefined,
    scryfall: value.scryfall,
    isToken: value.isToken === true,
    power: typeof value.power === "string" ? value.power : value.power?.toString(),
    toughness: typeof value.toughness === "string" ? value.toughness : value.toughness?.toString(),
    basePower: typeof value.basePower === "string" ? value.basePower : value.basePower?.toString(),
    baseToughness:
      typeof value.baseToughness === "string" ? value.baseToughness : value.baseToughness?.toString(),
    customText: typeof value.customText === "string" ? value.customText.slice(0, 280) : undefined,
  };
};

const sanitizePlayerOrder = (value: any, players: Record<string, Player>, max: number): string[] => {
  const result: string[] = [];
  const seen = new Set<string>();
  const source = Array.isArray(value) ? value : [];
  for (const id of source) {
    if (typeof id !== "string") continue;
    if (!players[id]) continue;
    if (seen.has(id)) continue;
    result.push(id);
    seen.add(id);
    if (result.length >= max) return result;
  }
  const remaining = Object.keys(players).sort();
  for (const id of remaining) {
    if (seen.has(id)) continue;
    result.push(id);
    if (result.length >= max) break;
  }
  return result;
};

type SharedSnapshotLike = {
  players: Record<string, any>;
  zones: Record<string, any>;
  cards: Record<string, any>;
  globalCounters: Record<string, any>;
  battlefieldViewScale?: Record<string, any>;
  playerOrder: any;
};

export function sanitizeSharedSnapshot(snapshot: SharedSnapshotLike) {
  const safePlayers: Record<string, Player> = {};
  let playerCount = 0;
  Object.entries(snapshot.players).forEach(([key, value]) => {
    if (playerCount >= MAX_PLAYERS) return;
    const p = sanitizePlayer(value);
    if (p) {
      safePlayers[key] = p;
      playerCount++;
    }
  });

  const safeZones: Record<string, Zone> = {};
  let zoneCount = 0;
  Object.entries(snapshot.zones).forEach(([key, value]) => {
    if (zoneCount >= MAX_ZONES) return;
    const z = sanitizeZone(value);
    if (z) {
      safeZones[key] = z;
      zoneCount++;
    }
  });

  const safeCards: Record<string, Card> = {};
  let cardCount = 0;
  Object.entries(snapshot.cards).forEach(([key, value]) => {
    if (cardCount >= MAX_CARDS) return;
    const c = sanitizeCard(value, safeZones);
    if (c) {
      safeCards[key] = c;
      cardCount++;
    }
  });

  // Filter zone cardIds to only reference existing cards
  Object.values(safeZones).forEach((zone) => {
    zone.cardIds = zone.cardIds.filter((id) => safeCards[id]);
  });

  // Ensure every card appears in its zone order, and enforce zone-specific invariants.
  Object.values(safeCards).forEach((card) => {
    const zone = safeZones[card.zoneId];
    if (!zone) return;

    if (!zone.cardIds.includes(card.id)) {
      zone.cardIds.push(card.id);
      if (zone.cardIds.length > MAX_CARDS_PER_ZONE) {
        zone.cardIds = zone.cardIds.slice(0, MAX_CARDS_PER_ZONE);
      }
    }

    const counters = enforceZoneCounterRules(card.counters, zone);
    if (counters !== card.counters) {
      safeCards[card.id] = { ...card, counters };
    }
  });

  const safeGlobalCounters: Record<string, string> = {};
  Object.entries(snapshot.globalCounters).forEach(([key, value]) => {
    if (typeof key === "string" && typeof value === "string") {
      safeGlobalCounters[key.slice(0, 64)] = value.slice(0, 16);
    }
  });

  const safeBattlefieldViewScale: Record<string, number> = {};
  Object.entries(snapshot.battlefieldViewScale ?? {}).forEach(([pid, value]) => {
    if (!safePlayers[pid]) return;
    safeBattlefieldViewScale[pid] = clampNumber(value, 0.5, 1, 1);
  });

  const safePlayerOrder = sanitizePlayerOrder(snapshot.playerOrder, safePlayers, MAX_PLAYERS);

  return {
    players: safePlayers,
    zones: safeZones,
    cards: safeCards,
    globalCounters: safeGlobalCounters,
    playerOrder: safePlayerOrder,
    battlefieldViewScale: safeBattlefieldViewScale,
  };
}
