import { describe, expect, it } from 'vitest';
import type { Card, Zone } from '@/types';
import { ZONE } from '@/constants/zones';
import { getCardsInZone, getZoneByType } from '../gameSelectors';

describe('gameSelectors', () => {
  it('getZoneByType returns the matching zone for the owner', () => {
    const zones = {
      lib1: { id: 'lib1', type: ZONE.LIBRARY, ownerId: 'p1', cardIds: [] },
      hand1: { id: 'hand1', type: ZONE.HAND, ownerId: 'p1', cardIds: [] },
      lib2: { id: 'lib2', type: ZONE.LIBRARY, ownerId: 'p2', cardIds: [] },
    } satisfies Record<string, Zone>;

    expect(getZoneByType(zones, 'p1', ZONE.LIBRARY)?.id).toBe('lib1');
    expect(getZoneByType(zones, 'p1', ZONE.HAND)?.id).toBe('hand1');
    expect(getZoneByType(zones, 'p2', ZONE.LIBRARY)?.id).toBe('lib2');
  });

  it("getZoneByType treats legacy 'command' as commander", () => {
    const zones: Record<string, Zone> = {
      cmd: { id: 'cmd', type: 'command', ownerId: 'p1', cardIds: [] } as unknown as Zone,
    };

    expect(getZoneByType(zones, 'p1', ZONE.COMMANDER)?.id).toBe('cmd');
  });

  it('getCardsInZone preserves order and drops missing cards', () => {
    const createCard = (id: string): Card => ({
      id,
      name: id,
      ownerId: 'p1',
      controllerId: 'p1',
      zoneId: 'z',
      tapped: false,
      faceDown: false,
      position: { x: 0, y: 0 },
      rotation: 0,
      counters: [],
    });

    const cards: Record<string, Card> = {
      c1: createCard('c1'),
      c2: createCard('c2'),
    };
    const zone: Zone = {
      id: 'z',
      type: ZONE.HAND,
      ownerId: 'p1',
      cardIds: ['c2', 'missing', 'c1'],
    };

    expect(getCardsInZone(cards, zone).map((card) => card.id)).toEqual(['c2', 'c1']);
  });
});

