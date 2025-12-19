import { describe, expect, it } from 'vitest';

import { ZONE } from '@/constants/zones';
import type { Card, Zone } from '@/types';

import { createSeatModel } from '../seatModel';

const makeCard = (overrides: Partial<Card>): Card => ({
  id: overrides.id ?? 'c',
  name: overrides.name ?? 'Card',
  ownerId: overrides.ownerId ?? 'p1',
  controllerId: overrides.controllerId ?? overrides.ownerId ?? 'p1',
  zoneId: overrides.zoneId ?? 'z',
  tapped: overrides.tapped ?? false,
  faceDown: overrides.faceDown ?? false,
  position: overrides.position ?? { x: 0.5, y: 0.5 },
  rotation: overrides.rotation ?? 0,
  counters: overrides.counters ?? [],
  knownToAll: overrides.knownToAll,
  revealedToAll: overrides.revealedToAll,
  revealedTo: overrides.revealedTo,
  currentFaceIndex: overrides.currentFaceIndex,
  power: overrides.power,
  toughness: overrides.toughness,
  basePower: overrides.basePower,
  baseToughness: overrides.baseToughness,
  customText: overrides.customText,
  imageUrl: overrides.imageUrl,
  oracleText: overrides.oracleText,
  typeLine: overrides.typeLine,
  scryfallId: overrides.scryfallId,
  scryfall: overrides.scryfall,
  isToken: overrides.isToken,
});

describe('createSeatModel', () => {
  it('never shows opponent library reveal badge for the viewer seat', () => {
    const library: Zone = { id: 'lib', type: ZONE.LIBRARY, ownerId: 'p1', cardIds: ['c1'] };
    const zones = { lib: library };
    const cards = { c1: makeCard({ id: 'c1', ownerId: 'p1', zoneId: 'lib', revealedToAll: true }) };

    const model = createSeatModel({
      playerId: 'p1',
      position: 'bottom-left',
      viewerPlayerId: 'p1',
      isMe: true,
      zones,
      cards,
      scale: 1,
    });

    expect(model.opponentLibraryRevealCount).toBe(0);
  });

  it('counts only library cards visible to the viewer', () => {
    const library: Zone = {
      id: 'lib2',
      type: ZONE.LIBRARY,
      ownerId: 'p2',
      cardIds: ['c1', 'c2', 'c3', 'missing'],
    };
    const zones = { lib2: library };
    const cards = {
      c1: makeCard({ id: 'c1', ownerId: 'p2', zoneId: 'lib2', revealedTo: ['p1'] }),
      c2: makeCard({ id: 'c2', ownerId: 'p2', zoneId: 'lib2', revealedToAll: true }),
      c3: makeCard({ id: 'c3', ownerId: 'p2', zoneId: 'lib2' }),
    };

    const model = createSeatModel({
      playerId: 'p2',
      position: 'top-right',
      viewerPlayerId: 'p1',
      isMe: false,
      zones,
      cards,
      scale: 1,
    });

    expect(model.isTop).toBe(true);
    expect(model.isRight).toBe(true);
    expect(model.cards.library).toHaveLength(3);
    expect(model.opponentLibraryRevealCount).toBe(2);
  });
});

