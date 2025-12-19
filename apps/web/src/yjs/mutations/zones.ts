import * as Y from 'yjs';

import type { Zone } from '@/types';

import type { SharedMaps } from './shared';
import { ensureChildMap, ensureZoneOrder, readValue, syncOrder } from './shared';

const writeZone = (maps: SharedMaps, zone: Zone) => {
  const target = ensureChildMap(maps.zones, zone.id);
  target.set('id', zone.id);
  target.set('type', zone.type);
  target.set('ownerId', zone.ownerId);
  const order = ensureZoneOrder(maps, zone.id, zone.cardIds);
  if (Array.isArray(zone.cardIds)) {
    const unique = Array.from(new Set(zone.cardIds));
    syncOrder(order, unique);
  }
};

export const readZone = (maps: SharedMaps, zoneId: string): Zone | null => {
  const target = maps.zones.get(zoneId);
  if (!target) return null;
  const getVal = (key: string) => readValue(target, key);
  const order = maps.zoneCardOrders.get(zoneId);
  let cardIds: string[] = [];
  if (order instanceof Y.Array) {
    cardIds = order.toArray();
  } else {
    const legacyIds = getVal('cardIds');
    if (Array.isArray(legacyIds)) {
      cardIds = legacyIds.filter((id) => typeof id === 'string');
    }
  }
  return {
    id: zoneId,
    type: getVal('type'),
    ownerId: getVal('ownerId'),
    cardIds: Array.from(new Set(cardIds)),
  } as Zone;
};

export function upsertZone(maps: SharedMaps, zone: Zone) {
  writeZone(maps, zone);
}

export function removeZone(maps: SharedMaps, zoneId: string) {
  const zone = readZone(maps, zoneId);
  if (zone) {
    zone.cardIds.forEach((cardId) => maps.cards.delete(cardId));
  }
  maps.zoneCardOrders.delete(zoneId);
  maps.zones.delete(zoneId);
}

export function reorderZoneCards(maps: SharedMaps, zoneId: string, orderedCardIds: string[]) {
  const zone = readZone(maps, zoneId);
  if (!zone) return;
  const unique = Array.from(new Set(orderedCardIds));
  const order = ensureZoneOrder(maps, zoneId, zone.cardIds);
  syncOrder(order, unique);
}
