import * as Y from 'yjs';
import { describe, expect, it } from 'vitest';
import { moveCard, SharedMaps, sharedSnapshot, upsertCard as yUpsertCard, upsertZone as yUpsertZone } from './yMutations';
import { ZONE } from '../constants/zones';
import { Card, Zone } from '../types';
import { SNAP_GRID_SIZE } from '../lib/snapping';

const createSharedMaps = (): SharedMaps => {
  const doc = new Y.Doc();
  return {
    players: doc.getMap('players'),
    zones: doc.getMap('zones'),
    cards: doc.getMap('cards'),
    zoneCardOrders: doc.getMap('zoneCardOrders'),
    globalCounters: doc.getMap('globalCounters'),
    battlefieldViewScale: doc.getMap('battlefieldViewScale'),
  };
};

describe('moveCard', () => {
  it('does not duplicate card ids when moving within the same zone', () => {
    const maps = createSharedMaps();

    const zone: Zone = {
      id: 'z1',
      type: ZONE.BATTLEFIELD,
      ownerId: 'p1',
      cardIds: ['c1'],
    };

    const card: Card = {
      id: 'c1',
      ownerId: 'p1',
      controllerId: 'p1',
      zoneId: zone.id,
      name: 'Test Card',
      tapped: false,
      faceDown: false,
      position: { x: 0, y: 0 },
      rotation: 0,
      counters: [],
    };

    yUpsertZone(maps, zone);
    yUpsertCard(maps, card);

    moveCard(maps, card.id, zone.id, { x: SNAP_GRID_SIZE, y: SNAP_GRID_SIZE });

    const updatedZone = sharedSnapshot(maps).zones[zone.id];
    expect(updatedZone?.cardIds).toEqual(['c1']);
  });
});

describe('sharedSnapshot legacy compatibility', () => {
  it('reads legacy plain objects stored in maps', () => {
    const maps = createSharedMaps();

    maps.players.set('p1', {
      id: 'p1',
      name: 'Alice',
      life: 20,
      commanderTax: 1,
      commanderDamage: { p2: 3 },
      counters: [{ type: 'poison', count: 1 }],
    } as any);

    maps.zones.set('z1', {
      id: 'z1',
      type: ZONE.HAND,
      ownerId: 'p1',
      cardIds: ['c1'],
    } as any);

    maps.cards.set('c1', {
      id: 'c1',
      ownerId: 'p1',
      controllerId: 'p1',
      zoneId: 'z1',
      position: { x: 0.25, y: 0.25 },
      counters: [{ type: '+1/+1', count: 2 }],
    } as any);

    const snapshot = sharedSnapshot(maps);

    expect(snapshot.players.p1?.name).toBe('Alice');
    expect(snapshot.players.p1?.commanderDamage?.p2).toBe(3);
    expect(snapshot.zones.z1?.cardIds).toEqual(['c1']);
    expect(snapshot.cards.c1?.zoneId).toBe('z1');
    expect(snapshot.cards.c1?.counters[0]).toEqual({ type: '+1/+1', count: 2 });
  });
});
