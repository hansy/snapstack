import type { Card } from "@/types";
import { enforceZoneCounterRules, mergeCounters } from "@/lib/counters";
import {
  bumpPosition,
  clampNormalizedPosition,
  findAvailablePositionNormalized,
  migratePositionToNormalized,
} from "@/lib/positions";
import {
  getCardFaces,
  getCurrentFaceIndex,
  isTransformableCard,
  syncCardStatsToFace,
} from "@/lib/cardDisplay";
import { ZONE } from "@/constants/zones";

import type { SharedMaps } from "../shared";
import { ensureZoneOrder, removeFromOrder } from "../shared";
import { readZone } from "../zones";
import { patchCard } from "./patchCard";
import { readCard, writeCard } from "./cardData";

const getCardsSnapshot = (maps: SharedMaps): Record<string, Card> => {
  const result: Record<string, Card> = {};
  maps.cards.forEach((_value, key) => {
    const card = readCard(maps, key as string);
    if (card) result[key as string] = card;
  });
  return result;
};

export function upsertCard(maps: SharedMaps, card: Card) {
  const zone = readZone(maps, card.zoneId);
  const nextCounters = enforceZoneCounterRules(card.counters, zone || undefined);
  writeCard(maps, { ...card, counters: nextCounters });
}

export function removeCard(maps: SharedMaps, cardId: string) {
  const card = readCard(maps, cardId);
  if (card) {
    const fromZone = readZone(maps, card.zoneId);
    const order = ensureZoneOrder(maps, card.zoneId, fromZone?.cardIds);
    removeFromOrder(order, cardId);
  }
  maps.cards.delete(cardId);
}

export function transformCard(maps: SharedMaps, cardId: string, faceIndex?: number) {
  const card = readCard(maps, cardId);
  if (!card) return;
  const zone = readZone(maps, card.zoneId);
  if (!zone || zone.type !== ZONE.BATTLEFIELD) return;
  if (!isTransformableCard(card)) return;

  const faces = getCardFaces(card);
  const targetIndex = faces.length
    ? typeof faceIndex === "number"
      ? Math.min(Math.max(faceIndex, 0), faces.length - 1)
      : (getCurrentFaceIndex(card) + 1) % faces.length
    : 0;

  const next = syncCardStatsToFace(card, targetIndex);
  patchCard(maps, cardId, {
    currentFaceIndex: next.currentFaceIndex,
    power: next.power,
    toughness: next.toughness,
    basePower: next.basePower,
    baseToughness: next.baseToughness,
  });
}

export function addCounterToCard(
  maps: SharedMaps,
  cardId: string,
  counter: { type: string; count: number; color?: string }
) {
  const card = readCard(maps, cardId);
  if (!card) return;
  const zone = readZone(maps, card.zoneId);
  if (!zone || zone.type !== ZONE.BATTLEFIELD) return;
  const merged = mergeCounters(card.counters, counter);
  patchCard(maps, cardId, { counters: merged });
}

export function removeCounterFromCard(maps: SharedMaps, cardId: string, counterType: string) {
  const card = readCard(maps, cardId);
  if (!card) return;
  const zone = readZone(maps, card.zoneId);
  if (!zone || zone.type !== ZONE.BATTLEFIELD) return;
  const next = card.counters
    .map((c) => (c.type === counterType ? { ...c, count: c.count - 1 } : c))
    .filter((c) => c.count > 0);
  patchCard(maps, cardId, { counters: next });
}

export function duplicateCard(maps: SharedMaps, cardId: string, newId: string) {
  const existing = readCard(maps, cardId);
  if (!existing) return;
  const zone = readZone(maps, existing.zoneId);
  if (!zone) return;

  const needsMigration = existing.position.x > 1 || existing.position.y > 1;
  const normalizedPosition = needsMigration ? migratePositionToNormalized(existing.position) : existing.position;
  if (needsMigration) writeCard(maps, { ...existing, position: normalizedPosition });

  const basePosition = bumpPosition(clampNormalizedPosition(normalizedPosition));
  const position = findAvailablePositionNormalized(basePosition, zone.cardIds, getCardsSnapshot(maps));
  const cloned: Card = {
    ...existing,
    id: newId,
    isToken: true,
    isCommander: false,
    commanderTax: 0,
    position,
    counters: existing.counters.map((c) => ({ ...c })),
  };
  writeCard(maps, cloned);
  ensureZoneOrder(maps, zone.id, zone.cardIds).push([newId]);
}
