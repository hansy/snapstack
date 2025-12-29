import type { Card, Player, Zone } from "@/types";

import { enforceZoneCounterRules } from "@/lib/counters";
import { MAX_CARDS, MAX_CARDS_PER_ZONE } from "@/lib/limits";
import { MAX_PLAYERS, MAX_ZONES } from "../sanitizeLimits";

import { sanitizeCard } from "./card";
import { sanitizePlayer, sanitizePlayerOrder } from "./player";
import { clampNumber } from "./utils";
import { sanitizeZone } from "./zone";

export type SharedSnapshotLike = {
  players: Record<string, any>;
  zones: Record<string, any>;
  cards: Record<string, any>;
  globalCounters: Record<string, any>;
  battlefieldViewScale?: Record<string, any>;
  playerOrder: any;
  meta?: Record<string, any>;
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

  Object.values(safeZones).forEach((zone) => {
    zone.cardIds = zone.cardIds.filter((id) => safeCards[id]);
  });

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
  const rawMeta = snapshot.meta ?? {};
  const roomHostId =
    typeof rawMeta.hostId === "string" && rawMeta.hostId.length > 0
      ? rawMeta.hostId
      : null;
  const roomLockedByHost = rawMeta.locked === true;

  return {
    players: safePlayers,
    zones: safeZones,
    cards: safeCards,
    globalCounters: safeGlobalCounters,
    playerOrder: safePlayerOrder,
    battlefieldViewScale: safeBattlefieldViewScale,
    roomHostId,
    roomLockedByHost,
  };
}
