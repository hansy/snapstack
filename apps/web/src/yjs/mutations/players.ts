import type { LibraryTopRevealMode, Player } from '@/types';

import { MAX_PLAYER_COLOR_LENGTH, MAX_PLAYER_NAME_LENGTH } from '../sanitizeLimits';

import type { SharedMaps } from './shared';
import {
  clampString,
  ensureChildMap,
  ensureZoneOrder,
  readValue,
  readCommanderDamage,
  readCounters,
  removeFromOrder,
  sanitizeCountersForSync,
} from './shared';
import { readCard } from './cards';
import { readZone } from './zones';

const ensurePlayerInOrder = (maps: SharedMaps, playerId: string) => {
  const order = maps.playerOrder;
  const current = order.toArray();
  if (!current.includes(playerId)) {
    order.push([playerId]);
  }
};

const removePlayerFromOrder = (maps: SharedMaps, playerId: string) => {
  const order = maps.playerOrder;
  for (let i = order.length - 1; i >= 0; i--) {
    if (order.get(i) === playerId) {
      order.delete(i, 1);
    }
  }
};

const normalizeLibraryTopReveal = (value: unknown): LibraryTopRevealMode | undefined => {
  if (value === "self" || value === "all") return value;
  return undefined;
};

const writePlayer = (maps: SharedMaps, player: Player) => {
  const target = ensureChildMap(maps.players, player.id);
  target.set('id', player.id);
  target.set('name', clampString(player.name, MAX_PLAYER_NAME_LENGTH));
  target.set('life', player.life);
  target.set('color', clampString(player.color, MAX_PLAYER_COLOR_LENGTH));
  target.set('cursor', player.cursor);
  target.set('commanderTax', player.commanderTax);
  target.set('deckLoaded', player.deckLoaded);
  if (typeof player.handCount === "number" && Number.isFinite(player.handCount)) {
    target.set("handCount", Math.max(0, Math.floor(player.handCount)));
  } else {
    target.delete("handCount");
  }
  if (typeof player.libraryCount === "number" && Number.isFinite(player.libraryCount)) {
    target.set("libraryCount", Math.max(0, Math.floor(player.libraryCount)));
  } else {
    target.delete("libraryCount");
  }
  if (typeof player.sideboardCount === "number" && Number.isFinite(player.sideboardCount)) {
    target.set("sideboardCount", Math.max(0, Math.floor(player.sideboardCount)));
  } else {
    target.delete("sideboardCount");
  }
  const libraryTopReveal = normalizeLibraryTopReveal(player.libraryTopReveal);
  if (libraryTopReveal) {
    target.set('libraryTopReveal', libraryTopReveal);
  } else {
    target.delete('libraryTopReveal');
  }
  target.set('counters', sanitizeCountersForSync(player.counters));
  const commanderDamage = ensureChildMap(target, 'commanderDamage');
  const seen = new Set<string>();
  Object.entries(player.commanderDamage ?? {}).forEach(([pid, dmg]) => {
    commanderDamage.set(pid, dmg);
    seen.add(pid);
  });
  commanderDamage.forEach((_v, key) => {
    if (!seen.has(key as string)) commanderDamage.delete(key as string);
  });
  ensurePlayerInOrder(maps, player.id);
};

export const readPlayer = (maps: SharedMaps, playerId: string): Player | null => {
  const target = maps.players.get(playerId);
  if (!target) return null;
  const getVal = (key: string) => readValue(target, key);
  const commanderDamageSource = getVal('commanderDamage');
  const commanderDamage = readCommanderDamage(commanderDamageSource);
  const libraryTopReveal = normalizeLibraryTopReveal(getVal('libraryTopReveal'));
  return {
    id: playerId,
    name: getVal('name'),
    life: getVal('life'),
    color: getVal('color'),
    cursor: getVal('cursor'),
    counters: readCounters(getVal('counters')),
    commanderDamage,
    commanderTax: getVal('commanderTax'),
    deckLoaded: getVal('deckLoaded'),
    handCount: getVal("handCount"),
    libraryCount: getVal("libraryCount"),
    sideboardCount: getVal("sideboardCount"),
    libraryTopReveal,
  } as Player;
};

export function removePlayer(maps: SharedMaps, playerId: string) {
  maps.players.delete(playerId);
  maps.battlefieldViewScale.delete(playerId);
  removePlayerFromOrder(maps, playerId);

  // Remove owned zones and their cards
  maps.zones.forEach((_zoneValue, zoneId) => {
    const zone = readZone(maps, zoneId as string);
    if (!zone || zone.ownerId !== playerId) return;
    zone.cardIds.forEach((cardId) => {
      maps.cards.delete(cardId);
    });
    maps.zoneCardOrders.delete(zoneId as string);
    maps.zones.delete(zoneId as string);
  });

  // Remove any remaining cards owned by the player (in other zones)
  maps.cards.forEach((_cardValue, cardId) => {
    const card = readCard(maps, cardId as string);
    if (card?.ownerId === playerId) {
      const zone = readZone(maps, card.zoneId);
      removeFromOrder(ensureZoneOrder(maps, card.zoneId, zone?.cardIds), cardId as string);
      maps.cards.delete(cardId as string);
    }
  });
}

export function upsertPlayer(maps: SharedMaps, player: Player) {
  writePlayer(maps, player);
}

export function patchPlayer(maps: SharedMaps, playerId: string, updates: Partial<Player>) {
  const current = readPlayer(maps, playerId);
  if (!current) return;
  writePlayer(maps, { ...current, ...updates, id: playerId });
}

export function setBattlefieldViewScale(maps: SharedMaps, playerId: string, scale: number) {
  const clamped = Math.max(0.5, Math.min(1, scale));
  maps.battlefieldViewScale.set(playerId, clamped);
}
