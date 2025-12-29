import type { Card, Player, Zone } from '@/types';

import type { SharedMaps } from './shared';
import { readCard } from './cards';
import { readPlayer } from './players';
import { readZone } from './zones';

export const sharedSnapshot = (maps: SharedMaps) => {
  const players: Record<string, Player> = {};
  const zones: Record<string, Zone> = {};
  const cards: Record<string, Card> = {};
  const globalCounters: Record<string, string> = {};
  const battlefieldViewScale: Record<string, number> = {};
  const playerOrder: string[] = [];
  const meta: Record<string, unknown> = {};

  maps.players.forEach((_value, key) => {
    const p = readPlayer(maps, key as string);
    if (p) players[key as string] = p;
  });
  maps.zones.forEach((_value, key) => {
    const z = readZone(maps, key as string);
    if (z) zones[key as string] = z;
  });
  maps.cards.forEach((_value, key) => {
    const c = readCard(maps, key as string);
    if (c) cards[key as string] = c;
  });
  maps.globalCounters.forEach((value, key) => {
    if (typeof value === 'string') {
      globalCounters[key as string] = value;
    }
  });

  maps.battlefieldViewScale.forEach((value, key) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      battlefieldViewScale[key as string] = value;
    }
  });

  maps.playerOrder.forEach((id) => {
    if (typeof id === 'string') {
      playerOrder.push(id);
    }
  });

  maps.meta.forEach((value, key) => {
    if (typeof key === 'string') {
      meta[key] = value;
    }
  });

  return { players, zones, cards, globalCounters, battlefieldViewScale, playerOrder, meta };
};
