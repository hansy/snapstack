import { describe, expect, it } from 'vitest';

import { ZONE, ZONE_LABEL, isCommanderZoneType } from '@/constants/zones';

describe('zone constants', () => {
  it('defines expected zone identifiers', () => {
    expect(ZONE).toEqual({
      LIBRARY: 'library',
      HAND: 'hand',
      BATTLEFIELD: 'battlefield',
      GRAVEYARD: 'graveyard',
      EXILE: 'exile',
      COMMANDER: 'commander',
      SIDEBOARD: 'sideboard',
    });
  });

  it('labels each zone for display', () => {
    const labels: Array<[keyof typeof ZONE_LABEL, string]> = [
      ['library', 'Library'],
      ['hand', 'Hand'],
      ['battlefield', 'Battlefield'],
      ['graveyard', 'Graveyard'],
      ['exile', 'Exile'],
      ['commander', 'Commander'],
      ['sideboard', 'Sideboard'],
    ];

    labels.forEach(([zoneType, label]) => {
      expect(ZONE_LABEL[zoneType]).toBe(label);
    });
  });

  it('detects commander zones (including legacy command)', () => {
    expect(isCommanderZoneType(ZONE.COMMANDER)).toBe(true);
    expect(isCommanderZoneType('command')).toBe(true);
    expect(isCommanderZoneType(ZONE.HAND)).toBe(false);
  });
});
