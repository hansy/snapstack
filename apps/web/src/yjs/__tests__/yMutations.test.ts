import * as Y from 'yjs';
import { describe, expect, it } from 'vitest';
import {
  addCounterToCard,
  duplicateCard,
  moveCard,
  patchCard,
  patchPlayer,
  removeCard,
  removeCounterFromCard,
  removePlayer,
  removeZone,
  reorderZoneCards,
  resetDeck,
  setBattlefieldViewScale,
  sharedSnapshot,
  transformCard,
  unloadDeck,
  upsertCard as yUpsertCard,
  upsertPlayer as yUpsertPlayer,
  upsertZone as yUpsertZone,
} from '../legacyMutations';
import type { SharedMaps } from '../legacyMutations';
import { ZONE } from '@/constants/zones';
import { Card, Player, Zone } from '@/types';
import { GRID_STEP_Y } from '@/lib/positions';
import { SNAP_GRID_SIZE } from '@/lib/snapping';

const createSharedMaps = (): SharedMaps => {
  const doc = new Y.Doc();
  return {
    players: doc.getMap('players'),
    playerOrder: doc.getArray('playerOrder'),
    zones: doc.getMap('zones'),
    cards: doc.getMap('cards'),
    zoneCardOrders: doc.getMap('zoneCardOrders'),
    globalCounters: doc.getMap('globalCounters'),
    battlefieldViewScale: doc.getMap('battlefieldViewScale'),
    meta: doc.getMap('meta'),
    handRevealsToAll: doc.getMap('handRevealsToAll'),
    libraryRevealsToAll: doc.getMap('libraryRevealsToAll'),
    faceDownRevealsToAll: doc.getMap('faceDownRevealsToAll'),
  };
};

const createDocAndMaps = (): { doc: Y.Doc; maps: SharedMaps } => {
  const doc = new Y.Doc();
  const maps: SharedMaps = {
    players: doc.getMap('players'),
    playerOrder: doc.getArray('playerOrder'),
    zones: doc.getMap('zones'),
    cards: doc.getMap('cards'),
    zoneCardOrders: doc.getMap('zoneCardOrders'),
    globalCounters: doc.getMap('globalCounters'),
    battlefieldViewScale: doc.getMap('battlefieldViewScale'),
    meta: doc.getMap('meta'),
    handRevealsToAll: doc.getMap('handRevealsToAll'),
    libraryRevealsToAll: doc.getMap('libraryRevealsToAll'),
    faceDownRevealsToAll: doc.getMap('faceDownRevealsToAll'),
  };
  return { doc, maps };
};

const measureTransactionUpdateBytes = (doc: Y.Doc, fn: () => void) => {
  let bytes = 0;
  const handler = (update: Uint8Array) => {
    bytes += update.byteLength;
  };
  doc.on('update', handler);
  doc.transact(fn);
  doc.off('update', handler);
  return bytes;
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

  it('migrates legacy plain-object cards before updating zone order', () => {
    const maps = createSharedMaps();

    const fromZone: Zone = {
      id: 'z1',
      type: ZONE.BATTLEFIELD,
      ownerId: 'p1',
      cardIds: ['c1'],
    };
    const toZone: Zone = {
      id: 'z2',
      type: ZONE.HAND,
      ownerId: 'p1',
      cardIds: [],
    };

    yUpsertZone(maps, fromZone);
    yUpsertZone(maps, toZone);

    // Legacy card stored as a plain object (not a Y.Map).
    maps.cards.set('c1', {
      id: 'c1',
      ownerId: 'p1',
      controllerId: 'p1',
      zoneId: fromZone.id,
      name: 'Legacy Card',
      tapped: false,
      faceDown: false,
      position: { x: 0.1, y: 0.1 },
      rotation: 0,
      counters: [],
    });

    expect(maps.cards.get('c1')).not.toBeInstanceOf(Y.Map);

    moveCard(maps, 'c1', toZone.id);

    expect(maps.cards.get('c1')).toBeInstanceOf(Y.Map);

    const snapshot = sharedSnapshot(maps);
    expect(snapshot.zones[fromZone.id]?.cardIds).not.toContain('c1');
    expect(snapshot.zones[toZone.id]?.cardIds).toEqual(['c1']);
  });

  it('shifts overlapping battlefield cards instead of stacking', () => {
    const maps = createSharedMaps();

    const zone: Zone = {
      id: 'z1',
      type: ZONE.BATTLEFIELD,
      ownerId: 'p1',
      cardIds: ['c1', 'c2'],
    };
    yUpsertZone(maps, zone);

    yUpsertCard(maps, {
      id: 'c1',
      ownerId: 'p1',
      controllerId: 'p1',
      zoneId: zone.id,
      name: 'Mover',
      tapped: false,
      faceDown: false,
      position: { x: 0.2, y: 0.2 },
      rotation: 0,
      counters: [],
    });
    yUpsertCard(maps, {
      id: 'c2',
      ownerId: 'p1',
      controllerId: 'p1',
      zoneId: zone.id,
      name: 'Occupied',
      tapped: false,
      faceDown: false,
      position: { x: 0.1, y: 0.1 },
      rotation: 0,
      counters: [],
    });

    moveCard(maps, 'c1', zone.id, { x: 0.1, y: 0.1 });

    const snapshot = sharedSnapshot(maps);
    expect(snapshot.cards.c2?.position.x).toBeCloseTo(0.1, 6);
    expect(snapshot.cards.c2?.position.y).toBeCloseTo(0.1, 6);
    expect(snapshot.cards.c1?.position.x).toBeCloseTo(0.1, 6);
    expect(snapshot.cards.c1?.position.y).toBeCloseTo(0.1 + GRID_STEP_Y, 6);
  });
});

describe('resetDeck', () => {
  it('clears reveal metadata for all cards in the library', () => {
    const maps = createSharedMaps();

    const library: Zone = {
      id: 'lib-p1',
      type: ZONE.LIBRARY,
      ownerId: 'p1',
      cardIds: ['c1', 'o1'],
    };
    const graveyard: Zone = {
      id: 'gy-p1',
      type: ZONE.GRAVEYARD,
      ownerId: 'p1',
      cardIds: ['c2'],
    };

    yUpsertZone(maps, library);
    yUpsertZone(maps, graveyard);

    yUpsertCard(maps, {
      id: 'c1',
      ownerId: 'p1',
      controllerId: 'p1',
      zoneId: library.id,
      name: 'Card1',
      tapped: false,
      faceDown: false,
      position: { x: 0.1, y: 0.1 },
      rotation: 0,
      counters: [],
      knownToAll: true,
      revealedToAll: true,
      revealedTo: ['p2'],
    });
    yUpsertCard(maps, {
      id: 'c2',
      ownerId: 'p1',
      controllerId: 'p1',
      zoneId: graveyard.id,
      name: 'Card2',
      tapped: false,
      faceDown: false,
      position: { x: 0.1, y: 0.1 },
      rotation: 0,
      counters: [],
      knownToAll: true,
      revealedToAll: true,
      revealedTo: ['p2'],
    });
    yUpsertCard(maps, {
      id: 'o1',
      ownerId: 'p2',
      controllerId: 'p2',
      zoneId: library.id,
      name: 'Other',
      tapped: false,
      faceDown: false,
      position: { x: 0.1, y: 0.1 },
      rotation: 0,
      counters: [],
      knownToAll: true,
      revealedToAll: true,
      revealedTo: ['p1'],
    });

    resetDeck(maps, 'p1');

    const snapshot = sharedSnapshot(maps);
    const libraryIds = new Set(snapshot.zones[library.id]?.cardIds ?? []);
    expect(libraryIds.has('c1')).toBe(true);
    expect(libraryIds.has('c2')).toBe(true);
    expect(libraryIds.has('o1')).toBe(true);

    expect(snapshot.cards.c1?.knownToAll).toBe(false);
    expect(snapshot.cards.c1?.revealedToAll).toBe(false);
    expect(snapshot.cards.c1?.revealedTo ?? []).toHaveLength(0);

    expect(snapshot.cards.c2?.knownToAll).toBe(false);
    expect(snapshot.cards.c2?.revealedToAll).toBe(false);
    expect(snapshot.cards.c2?.revealedTo ?? []).toHaveLength(0);

    expect(snapshot.cards.o1?.knownToAll).toBe(false);
    expect(snapshot.cards.o1?.revealedToAll).toBe(false);
    expect(snapshot.cards.o1?.revealedTo ?? []).toHaveLength(0);
  });

  it('clears library top reveal setting for the player', () => {
    const maps = createSharedMaps();

    const library: Zone = {
      id: 'lib-p1',
      type: ZONE.LIBRARY,
      ownerId: 'p1',
      cardIds: [],
    };

    yUpsertZone(maps, library);
    yUpsertPlayer(maps, {
      id: 'p1',
      name: 'P1',
      life: 40,
      counters: [],
      commanderDamage: {},
      commanderTax: 0,
      deckLoaded: true,
      libraryTopReveal: 'all',
    });

    resetDeck(maps, 'p1');

    const snapshot = sharedSnapshot(maps);
    expect(snapshot.players.p1?.libraryTopReveal).toBeUndefined();
  });

  it('resets owned card state before returning to the library', () => {
    const maps = createSharedMaps();

    const library: Zone = {
      id: 'lib-p1',
      type: ZONE.LIBRARY,
      ownerId: 'p1',
      cardIds: [],
    };
    const battlefield: Zone = {
      id: 'bf-p1',
      type: ZONE.BATTLEFIELD,
      ownerId: 'p1',
      cardIds: ['c1'],
    };

    yUpsertZone(maps, library);
    yUpsertZone(maps, battlefield);

    yUpsertCard(maps, {
      id: 'c1',
      ownerId: 'p1',
      controllerId: 'p2',
      zoneId: battlefield.id,
      name: 'Card1',
      tapped: true,
      faceDown: true,
      position: { x: 0.2, y: 0.2 },
      rotation: 90,
      counters: [{ type: '+1/+1', count: 2 }],
      customText: 'Note',
      power: '5',
      toughness: '6',
      basePower: '2',
      baseToughness: '3',
    });

    resetDeck(maps, 'p1');

    const snapshot = sharedSnapshot(maps);
    const resetCard = snapshot.cards.c1;
    expect(resetCard?.zoneId).toBe(library.id);
    expect(resetCard?.controllerId).toBe('p1');
    expect(resetCard?.rotation).toBe(0);
    expect(resetCard?.customText).toBeUndefined();
    expect(resetCard?.tapped).toBe(false);
    expect(resetCard?.faceDown).toBe(false);
    expect(resetCard?.power).toBe('2');
    expect(resetCard?.toughness).toBe('3');
    expect(resetCard?.basePower).toBe('2');
    expect(resetCard?.baseToughness).toBe('3');
  });
});

describe('unloadDeck', () => {
  it('removes all owned cards and sets deckLoaded=false', () => {
    const maps = createSharedMaps();

    const library: Zone = {
      id: 'lib-p1',
      type: ZONE.LIBRARY,
      ownerId: 'p1',
      cardIds: ['c1', 'o1'],
    };
    const battlefield: Zone = {
      id: 'bf-p1',
      type: ZONE.BATTLEFIELD,
      ownerId: 'p1',
      cardIds: ['c2'],
    };

    yUpsertZone(maps, library);
    yUpsertZone(maps, battlefield);

    yUpsertPlayer(maps, {
      id: 'p1',
      name: 'P1',
      life: 40,
      counters: [],
      commanderDamage: {},
      commanderTax: 0,
      deckLoaded: true,
      libraryTopReveal: 'self',
    });

    yUpsertCard(maps, {
      id: 'c1',
      ownerId: 'p1',
      controllerId: 'p1',
      zoneId: library.id,
      name: 'Owned In Library',
      tapped: false,
      faceDown: true,
      position: { x: 0.1, y: 0.1 },
      rotation: 0,
      counters: [],
    });
    yUpsertCard(maps, {
      id: 'c2',
      ownerId: 'p1',
      controllerId: 'p1',
      zoneId: battlefield.id,
      name: 'Owned On Battlefield',
      tapped: false,
      faceDown: false,
      position: { x: 0.2, y: 0.2 },
      rotation: 0,
      counters: [],
    });
    // Not owned by p1, but sitting in p1's library (e.g. stolen/known card). Should remain.
    yUpsertCard(maps, {
      id: 'o1',
      ownerId: 'p2',
      controllerId: 'p2',
      zoneId: library.id,
      name: 'Other Card',
      tapped: false,
      faceDown: false,
      position: { x: 0.3, y: 0.3 },
      rotation: 0,
      counters: [],
    });

    unloadDeck(maps, 'p1');

    const snapshot = sharedSnapshot(maps);
    expect(snapshot.cards.c1).toBeUndefined();
    expect(snapshot.cards.c2).toBeUndefined();
    expect(snapshot.cards.o1).toBeTruthy();
    expect(snapshot.zones[library.id]?.cardIds).toEqual(['o1']);
    expect(snapshot.zones[battlefield.id]?.cardIds).toEqual([]);
    expect(snapshot.players.p1?.deckLoaded).toBe(false);
    expect(snapshot.players.p1?.libraryTopReveal).toBeUndefined();
  });
});

describe('zones', () => {
  it('reorderZoneCards enforces uniqueness and order', () => {
    const maps = createSharedMaps();
    const zone: Zone = {
      id: 'z1',
      type: ZONE.GRAVEYARD,
      ownerId: 'p1',
      cardIds: ['c1', 'c2', 'c3'],
    };
    yUpsertZone(maps, zone);
    yUpsertCard(maps, {
      id: 'c1',
      ownerId: 'p1',
      controllerId: 'p1',
      zoneId: zone.id,
      name: 'C1',
      tapped: false,
      faceDown: false,
      position: { x: 0.1, y: 0.1 },
      rotation: 0,
      counters: [],
    });
    yUpsertCard(maps, {
      id: 'c2',
      ownerId: 'p1',
      controllerId: 'p1',
      zoneId: zone.id,
      name: 'C2',
      tapped: false,
      faceDown: false,
      position: { x: 0.2, y: 0.2 },
      rotation: 0,
      counters: [],
    });
    yUpsertCard(maps, {
      id: 'c3',
      ownerId: 'p1',
      controllerId: 'p1',
      zoneId: zone.id,
      name: 'C3',
      tapped: false,
      faceDown: false,
      position: { x: 0.3, y: 0.3 },
      rotation: 0,
      counters: [],
    });

    reorderZoneCards(maps, zone.id, ['c2', 'c2', 'c1']);

    const snapshot = sharedSnapshot(maps);
    expect(snapshot.zones[zone.id]?.cardIds).toEqual(['c2', 'c1']);
    expect(snapshot.cards.c3).toBeTruthy();
  });

  it('removeZone deletes the zone, its order, and its cards', () => {
    const maps = createSharedMaps();
    const zone: Zone = {
      id: 'z1',
      type: ZONE.EXILE,
      ownerId: 'p1',
      cardIds: ['c1', 'c2'],
    };
    yUpsertZone(maps, zone);
    yUpsertCard(maps, {
      id: 'c1',
      ownerId: 'p1',
      controllerId: 'p1',
      zoneId: zone.id,
      name: 'C1',
      tapped: false,
      faceDown: false,
      position: { x: 0.1, y: 0.1 },
      rotation: 0,
      counters: [],
    });
    yUpsertCard(maps, {
      id: 'c2',
      ownerId: 'p1',
      controllerId: 'p1',
      zoneId: zone.id,
      name: 'C2',
      tapped: false,
      faceDown: false,
      position: { x: 0.2, y: 0.2 },
      rotation: 0,
      counters: [],
    });

    removeZone(maps, zone.id);

    const snapshot = sharedSnapshot(maps);
    expect(snapshot.zones[zone.id]).toBeUndefined();
    expect(snapshot.cards.c1).toBeUndefined();
    expect(snapshot.cards.c2).toBeUndefined();
  });
});

describe('players', () => {
  it('patchPlayer clamps name/color and syncs commanderDamage keys', () => {
    const maps = createSharedMaps();

    yUpsertPlayer(maps, {
      id: 'p1',
      name: 'P1',
      life: 40,
      counters: [],
      commanderDamage: { p2: 3, p3: 1 },
      commanderTax: 0,
      deckLoaded: true,
      color: 'rose',
    });

    patchPlayer(maps, 'p1', {
      name: 'x'.repeat(200),
      color: 'y'.repeat(200),
      commanderDamage: { p2: 10 },
    });

    const snapshot = sharedSnapshot(maps);
    expect(snapshot.players.p1?.name.length).toBe(120);
    expect(snapshot.players.p1?.color?.length).toBe(16);
    expect(snapshot.players.p1?.commanderDamage).toEqual({ p2: 10 });
  });

  it('setBattlefieldViewScale clamps to [0.5, 1]', () => {
    const maps = createSharedMaps();

    setBattlefieldViewScale(maps, 'p1', 2);
    expect(sharedSnapshot(maps).battlefieldViewScale.p1).toBe(1);

    setBattlefieldViewScale(maps, 'p1', 0.1);
    expect(sharedSnapshot(maps).battlefieldViewScale.p1).toBe(0.5);

    setBattlefieldViewScale(maps, 'p1', 0.75);
    expect(sharedSnapshot(maps).battlefieldViewScale.p1).toBe(0.75);
  });
});

describe('Yjs update size regression', () => {
  it('moveCard does not rewrite the whole doc', () => {
    const { doc, maps } = createDocAndMaps();

    const zone: Zone = {
      id: 'z1',
      type: ZONE.BATTLEFIELD,
      ownerId: 'p1',
      cardIds: [],
    };
    yUpsertZone(maps, zone);

    const bigText = 'x'.repeat(5_000);

    // Add 100 cards with large identity fields.
    doc.transact(() => {
      for (let i = 0; i < 100; i++) {
        const id = `c${i}`;
        const card: Card = {
          id,
          ownerId: 'p1',
          controllerId: 'p1',
          zoneId: zone.id,
          name: `Card ${i}`,
          oracleText: bigText,
          tapped: false,
          faceDown: false,
          position: { x: 0.02 + i * 0.001, y: 0.02 + i * 0.001 },
          rotation: 0,
          counters: [],
        };
        zone.cardIds.push(id);
        yUpsertCard(maps, card);
      }
    });

    // Force a single collision to exercise the overlap-shift logic.
    const bytes = measureTransactionUpdateBytes(doc, () => {
      moveCard(maps, 'c0', zone.id, { x: 0.1, y: 0.1 });
    });

    // Should only touch the moved card (and at most a couple collision-adjusted cards).
    // If this ever spikes, it likely means we're rewriting full card payloads again.
    expect(bytes).toBeLessThan(10_000);
  });

  it('patchCard(tapped) stays small even with large card payloads', () => {
    const { doc, maps } = createDocAndMaps();

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
      name: 'Big Card',
      oracleText: 'x'.repeat(10_000),
      tapped: false,
      faceDown: false,
      position: { x: 0.1, y: 0.1 },
      rotation: 0,
      counters: [],
    };

    doc.transact(() => {
      yUpsertZone(maps, zone);
      yUpsertCard(maps, card);
    });

    const bytes = measureTransactionUpdateBytes(doc, () => {
      patchCard(maps, card.id, { tapped: true });
    });

    expect(bytes).toBeLessThan(2_000);
  });

  it('upsertCard strips full ScryfallCard blobs before syncing', () => {
    const { doc, maps } = createDocAndMaps();

    const zone: Zone = {
      id: 'z1',
      type: ZONE.BATTLEFIELD,
      ownerId: 'p1',
      cardIds: [],
    };
    yUpsertZone(maps, zone);

    const hugeBlob = 'x'.repeat(50_000);
    const fullScryfall: any = {
      id: 's1',
      layout: 'token',
      type_line: 'Token Creature',
      color_identity: [],
      blob: hugeBlob,
      image_uris: { normal: 'https://example.com/card.png' },
      card_faces: [{ name: 'Face', image_uris: { normal: 'https://example.com/face.png' }, power: '1', toughness: '1' }],
    };

    const card: Card = {
      id: 'c1',
      ownerId: 'p1',
      controllerId: 'p1',
      zoneId: zone.id,
      name: 'Big Token',
      typeLine: 'Token Creature',
      scryfallId: 's1',
      scryfall: fullScryfall,
      tapped: false,
      faceDown: false,
      position: { x: 0.1, y: 0.1 },
      rotation: 0,
      counters: [],
    };

    const bytes = measureTransactionUpdateBytes(doc, () => {
      yUpsertCard(maps, card);
    });

    // If full Scryfall payloads ever leak into the shared doc, this will spike.
    expect(bytes).toBeLessThan(10_000);

    const snapshot = sharedSnapshot(maps);
    const stored: any = snapshot.cards.c1?.scryfall;
    expect(stored).toBeTruthy();
    expect('type_line' in stored).toBe(false);
    expect('color_identity' in stored).toBe(false);
    expect('blob' in stored).toBe(false);
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

describe('player order tracking', () => {
  it('adds and removes players from the shared order', () => {
    const maps = createSharedMaps();
    const p1: Player = { id: 'p1', name: 'P1', life: 40, counters: [], commanderDamage: {}, commanderTax: 0 };
    const p2: Player = { id: 'p2', name: 'P2', life: 40, counters: [], commanderDamage: {}, commanderTax: 0 };

    yUpsertPlayer(maps, p1);
    yUpsertPlayer(maps, p2);

    expect(sharedSnapshot(maps).playerOrder).toEqual(['p1', 'p2']);

    removePlayer(maps, 'p1');
    expect(sharedSnapshot(maps).playerOrder).toEqual(['p2']);
  });
});

describe('write-time clamping', () => {
  it('clamps customText and counter type lengths', () => {
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
      name: 'Card',
      tapped: false,
      faceDown: false,
      position: { x: 0.1, y: 0.1 },
      rotation: 0,
      counters: [{ type: 'x'.repeat(500), count: 1, color: '#'.repeat(200) }],
      customText: 'y'.repeat(1_000),
    };

    yUpsertZone(maps, zone);
    yUpsertCard(maps, card);

    const snapshot = sharedSnapshot(maps);
    expect(snapshot.cards.c1?.customText?.length).toBe(280);
    expect(snapshot.cards.c1?.counters?.[0]?.type.length).toBeLessThanOrEqual(64);
    expect(snapshot.cards.c1?.counters?.[0]?.color?.length).toBeLessThanOrEqual(32);
  });
});

describe('card ops', () => {
  it('addCounterToCard and removeCounterFromCard modify battlefield counters', () => {
    const maps = createSharedMaps();
    const zone: Zone = {
      id: 'bf-p1',
      type: ZONE.BATTLEFIELD,
      ownerId: 'p1',
      cardIds: ['c1'],
    };
    yUpsertZone(maps, zone);
    yUpsertCard(maps, {
      id: 'c1',
      ownerId: 'p1',
      controllerId: 'p1',
      zoneId: zone.id,
      name: 'Counter Card',
      tapped: false,
      faceDown: false,
      position: { x: 0.1, y: 0.1 },
      rotation: 0,
      counters: [],
    });

    addCounterToCard(maps, 'c1', { type: '+1/+1', count: 1, color: '#00ff00' });
    addCounterToCard(maps, 'c1', { type: '+1/+1', count: 1, color: '#00ff00' });

    let snapshot = sharedSnapshot(maps);
    expect(snapshot.cards.c1?.counters).toEqual([{ type: '+1/+1', count: 2, color: '#00ff00' }]);

    removeCounterFromCard(maps, 'c1', '+1/+1');
    snapshot = sharedSnapshot(maps);
    expect(snapshot.cards.c1?.counters).toEqual([{ type: '+1/+1', count: 1, color: '#00ff00' }]);

    removeCounterFromCard(maps, 'c1', '+1/+1');
    snapshot = sharedSnapshot(maps);
    expect(snapshot.cards.c1?.counters).toEqual([]);
  });

  it('duplicateCard creates a token copy and normalizes legacy positions', () => {
    const maps = createSharedMaps();
    const zone: Zone = {
      id: 'bf-p1',
      type: ZONE.BATTLEFIELD,
      ownerId: 'p1',
      cardIds: ['c1'],
    };
    yUpsertZone(maps, zone);

    yUpsertCard(maps, {
      id: 'c1',
      ownerId: 'p1',
      controllerId: 'p1',
      zoneId: zone.id,
      name: 'Legacy Positioned',
      tapped: false,
      faceDown: false,
      // Legacy pixel position (forces migration).
      position: { x: 100, y: 100 },
      rotation: 0,
      counters: [{ type: 'poison', count: 1, color: '#ff00ff' }],
    });

    duplicateCard(maps, 'c1', 't1');

    const snapshot = sharedSnapshot(maps);
    expect(snapshot.cards.t1).toBeTruthy();
    expect(snapshot.cards.t1?.isToken).toBe(true);
    expect(snapshot.cards.t1?.zoneId).toBe(zone.id);
    expect(snapshot.cards.t1?.counters).toEqual([{ type: 'poison', count: 1, color: '#ff00ff' }]);

    // Both cards should be normalized in [0,1].
    expect(snapshot.cards.c1?.position.x).toBeLessThanOrEqual(1);
    expect(snapshot.cards.c1?.position.y).toBeLessThanOrEqual(1);
    expect(snapshot.cards.t1?.position.x).toBeLessThanOrEqual(1);
    expect(snapshot.cards.t1?.position.y).toBeLessThanOrEqual(1);

    // Token should not land exactly on the original position.
    expect(snapshot.cards.t1?.position).not.toEqual(snapshot.cards.c1?.position);

    expect(snapshot.zones[zone.id]?.cardIds).toEqual(['c1', 't1']);
  });

  it('transformCard updates face index and syncs stats on battlefield', () => {
    const maps = createSharedMaps();
    const zone: Zone = {
      id: 'bf-p1',
      type: ZONE.BATTLEFIELD,
      ownerId: 'p1',
      cardIds: ['c1'],
    };
    yUpsertZone(maps, zone);

    yUpsertCard(maps, {
      id: 'c1',
      ownerId: 'p1',
      controllerId: 'p1',
      zoneId: zone.id,
      name: 'DFCard',
      tapped: false,
      faceDown: false,
      position: { x: 0.1, y: 0.1 },
      rotation: 0,
      counters: [],
      scryfall: {
        id: 's1',
        layout: 'transform',
        image_uris: { normal: 'https://example.com/front.png' },
        card_faces: [
          { name: 'Front', power: '1', toughness: '1', image_uris: { normal: 'https://example.com/front.png' } },
          { name: 'Back', power: '3', toughness: '2', image_uris: { normal: 'https://example.com/back.png' } },
        ],
      } as any,
      currentFaceIndex: 0,
    });

    transformCard(maps, 'c1');

    const snapshot = sharedSnapshot(maps);
    expect(snapshot.cards.c1?.currentFaceIndex).toBe(1);
    expect(snapshot.cards.c1?.power).toBe('3');
    expect(snapshot.cards.c1?.toughness).toBe('2');
    expect(snapshot.cards.c1?.basePower).toBe('3');
    expect(snapshot.cards.c1?.baseToughness).toBe('2');
  });

  it('removeCard updates zone order and deletes the card', () => {
    const maps = createSharedMaps();
    const zone: Zone = {
      id: 'z1',
      type: ZONE.HAND,
      ownerId: 'p1',
      cardIds: ['c1', 'c2'],
    };
    yUpsertZone(maps, zone);
    yUpsertCard(maps, {
      id: 'c1',
      ownerId: 'p1',
      controllerId: 'p1',
      zoneId: zone.id,
      name: 'C1',
      tapped: false,
      faceDown: false,
      position: { x: 0.1, y: 0.1 },
      rotation: 0,
      counters: [],
    });
    yUpsertCard(maps, {
      id: 'c2',
      ownerId: 'p1',
      controllerId: 'p1',
      zoneId: zone.id,
      name: 'C2',
      tapped: false,
      faceDown: false,
      position: { x: 0.2, y: 0.2 },
      rotation: 0,
      counters: [],
    });

    removeCard(maps, 'c1');

    const snapshot = sharedSnapshot(maps);
    expect(snapshot.cards.c1).toBeUndefined();
    expect(snapshot.zones[zone.id]?.cardIds).toEqual(['c2']);
  });
});
