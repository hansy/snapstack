import * as Y from 'yjs';
import { Card, Player, Zone } from '../types';
import { enforceZoneCounterRules, mergeCounters } from '../lib/counters';
import { bumpPosition, clampNormalizedPosition, findAvailablePositionNormalized, GRID_STEP_Y, migratePositionToNormalized, positionsRoughlyEqual } from '../lib/positions';
import { getCardFaces, getCurrentFaceIndex, isTransformableCard, syncCardStatsToFace } from '../lib/cardDisplay';
import { ZONE } from '../constants/zones';

export type SharedMaps = {
  players: Y.Map<any>;
  zones: Y.Map<any>;
  cards: Y.Map<any>;
  globalCounters: Y.Map<any>;
};

// Utility to read a plain object from a Y.Map
export const toPlain = <T,>(map: Y.Map<T>) => {
  const result: Record<string, T> = {};
  map.forEach((value, key) => {
    result[key] = value;
  });
  return result;
};

export function removePlayer(maps: SharedMaps, playerId: string) {
  maps.players.delete(playerId);

  // Remove owned zones and their cards
  const zonesPlain = toPlain(maps.zones) as Record<string, Zone>;
  const cardsPlain = toPlain(maps.cards) as Record<string, Card>;

  Object.entries(zonesPlain).forEach(([zoneId, zone]) => {
    if (zone.ownerId === playerId) {
      maps.zones.delete(zoneId);
      // Remove cards in this zone
      zone.cardIds.forEach((cardId) => {
        maps.cards.delete(cardId);
      });
    }
  });

  // Remove any remaining cards owned by the player (in other zones)
  Object.entries(cardsPlain).forEach(([cardId, card]) => {
    if (card.ownerId === playerId) {
      maps.cards.delete(cardId);
    }
  });
}

export function upsertPlayer(maps: SharedMaps, player: Player) {
  maps.players.set(player.id, player);
}

export function upsertZone(maps: SharedMaps, zone: Zone) {
  maps.zones.set(zone.id, zone);
}

export function removeZone(maps: SharedMaps, zoneId: string) {
  const zone = maps.zones.get(zoneId) as Zone | undefined;
  if (!zone) return;
  zone.cardIds.forEach((cardId) => maps.cards.delete(cardId));
  maps.zones.delete(zoneId);
}

export function upsertCard(maps: SharedMaps, card: Card) {
  const next = enforceZoneCounterRules(card.counters, maps.zones.get(card.zoneId) as Zone | undefined);
  maps.cards.set(card.id, { ...card, counters: next });
}

export function removeCard(maps: SharedMaps, cardId: string) {
  maps.cards.delete(cardId);
  // Remove from any zone cardIds list that contains it
  maps.zones.forEach((zone: Zone, zoneId: string) => {
    if (zone.cardIds?.includes(cardId)) {
      maps.zones.set(zoneId, { ...zone, cardIds: zone.cardIds.filter((id) => id !== cardId) });
    }
  });
}

export function moveCard(maps: SharedMaps, cardId: string, toZoneId: string, position?: { x: number; y: number }) {
  const currentCard = maps.cards.get(cardId) as Card | undefined;
  if (!currentCard) return;

  const card = (currentCard.position.x > 1 || currentCard.position.y > 1)
    ? { ...currentCard, position: migratePositionToNormalized(currentCard.position) }
    : currentCard;
  if (card !== currentCard) {
    maps.cards.set(cardId, card);
  }

  const fromZoneId = card.zoneId;
  const fromZone = maps.zones.get(fromZoneId) as Zone | undefined;
  const toZone = maps.zones.get(toZoneId) as Zone | undefined;
  if (!fromZone || !toZone) return;

  const normalizedInput = position && (position.x > 1 || position.y > 1)
    ? migratePositionToNormalized(position)
    : position;
  let newPosition = clampNormalizedPosition(normalizedInput || card.position);
  const cardsCopy = toPlain(maps.cards) as Record<string, Card>;
  Object.entries(cardsCopy).forEach(([id, c]) => {
    if (c.position.x > 1 || c.position.y > 1) {
      const normalized = { ...c, position: migratePositionToNormalized(c.position) };
      cardsCopy[id] = normalized;
      maps.cards.set(id, normalized);
    }
  });
  const leavingBattlefield = fromZone.type === ZONE.BATTLEFIELD && toZone.type !== ZONE.BATTLEFIELD;
  const resetToFront = leavingBattlefield ? syncCardStatsToFace({ ...card, currentFaceIndex: 0 }, 0) : card;

  // If moving to battlefield, snap and resolve collisions
  if (toZone.type === ZONE.BATTLEFIELD && position) {
    const otherIds = toZone.cardIds.filter((id) => id !== cardId);
    for (const otherId of otherIds) {
      const otherCard = cardsCopy[otherId];
      if (!otherCard) continue;

      if (positionsRoughlyEqual(otherCard.position, newPosition)) {
        let candidateY = otherCard.position.y + GRID_STEP_Y;
        const candidateX = newPosition.x;
        let occupied = true;
        while (occupied) {
          occupied = false;
          for (const checkId of otherIds) {
            if (checkId === otherId) continue;
            const checkCard = cardsCopy[checkId];
            if (!checkCard) continue;
            if (positionsRoughlyEqual(checkCard.position, { x: candidateX, y: candidateY })) {
              candidateY += GRID_STEP_Y;
              occupied = true;
              break;
            }
          }
        }
        cardsCopy[otherId] = { ...otherCard, position: clampNormalizedPosition({ ...otherCard.position, x: candidateX, y: candidateY }) };
      }
    }
  }

  // Apply collision adjustments back
  Object.entries(cardsCopy).forEach(([id, c]) => {
    if (maps.cards.get(id)) {
      maps.cards.set(id, c);
    }
  });

  // Remove from old zone
  const newFromZoneCardIds = fromZone.cardIds.filter((id) => id !== cardId);
  const nextCounters = enforceZoneCounterRules(card.counters, toZone);
  const nextCard = leavingBattlefield ? resetToFront : card;
  const movingWithinSameZone = fromZoneId === toZoneId;
  const nextCardState = {
    ...nextCard,
    zoneId: toZoneId,
    position: newPosition,
    tapped: toZone.type === ZONE.BATTLEFIELD ? card.tapped : false,
    counters: nextCounters,
  };

  // If we're staying in the same zone, just move and ensure the id isn't duplicated
  if (movingWithinSameZone) {
    const reordered = [...newFromZoneCardIds, cardId];
    maps.cards.set(cardId, nextCardState);
    maps.zones.set(fromZoneId, { ...fromZone, cardIds: reordered });
    return;
  }

  // Add to new zone
  const newToZoneCardIds = [...toZone.cardIds, cardId];

  maps.cards.set(cardId, nextCardState);

  maps.zones.set(fromZoneId, { ...fromZone, cardIds: newFromZoneCardIds });
  maps.zones.set(toZoneId, { ...toZone, cardIds: newToZoneCardIds });
}

export function transformCard(maps: SharedMaps, cardId: string, faceIndex?: number) {
  const card = maps.cards.get(cardId) as Card | undefined;
  if (!card) return;
  const zone = maps.zones.get(card.zoneId) as Zone | undefined;
  if (!zone || zone.type !== ZONE.BATTLEFIELD) return;
  if (!isTransformableCard(card)) return;

  const faces = getCardFaces(card);
  const targetIndex = faces.length
    ? typeof faceIndex === 'number'
      ? Math.min(Math.max(faceIndex, 0), faces.length - 1)
      : (getCurrentFaceIndex(card) + 1) % faces.length
    : 0;

  maps.cards.set(cardId, syncCardStatsToFace(card, targetIndex));
}

export function addCounterToCard(maps: SharedMaps, cardId: string, counter: { type: string; count: number; color?: string }) {
  const card = maps.cards.get(cardId) as Card | undefined;
  if (!card) return;
  const zone = maps.zones.get(card.zoneId) as Zone | undefined;
  if (!zone || zone.type !== ZONE.BATTLEFIELD) return;
  const merged = mergeCounters(card.counters, counter);
  maps.cards.set(cardId, { ...card, counters: merged });
}

export function removeCounterFromCard(maps: SharedMaps, cardId: string, counterType: string) {
  const card = maps.cards.get(cardId) as Card | undefined;
  if (!card) return;
  const zone = maps.zones.get(card.zoneId) as Zone | undefined;
  if (!zone || zone.type !== ZONE.BATTLEFIELD) return;
  const next = card.counters.map((c) => (c.type === counterType ? { ...c, count: c.count - 1 } : c)).filter((c) => c.count > 0);
  maps.cards.set(cardId, { ...card, counters: next });
}

export function reorderZoneCards(maps: SharedMaps, zoneId: string, orderedCardIds: string[]) {
  const zone = maps.zones.get(zoneId) as Zone | undefined;
  if (!zone) return;
  maps.zones.set(zoneId, { ...zone, cardIds: orderedCardIds });
}

export function duplicateCard(maps: SharedMaps, cardId: string, newId: string) {
  const existing = maps.cards.get(cardId) as Card | undefined;
  if (!existing) return;
  const zone = maps.zones.get(card.zoneId) as Zone | undefined;
  if (!zone) return;
  const positionSource = (existing.position.x > 1 || existing.position.y > 1)
    ? migratePositionToNormalized(existing.position)
    : existing.position;
  const card = { ...existing, position: positionSource };
  if (card !== existing) maps.cards.set(cardId, card);

  const basePosition = bumpPosition(clampNormalizedPosition(card.position));
  const position = findAvailablePositionNormalized(basePosition, zone.cardIds, toPlain(maps.cards));
  const cloned: Card = {
    ...card,
    id: newId,
    isToken: true,
    position,
    counters: card.counters.map((c) => ({ ...c })),
  };
  maps.cards.set(newId, cloned);
  maps.zones.set(zone.id, { ...zone, cardIds: [...zone.cardIds, newId] });
}
