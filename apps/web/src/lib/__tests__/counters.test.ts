import { describe, expect, it } from 'vitest';
import { ZONE } from '@/constants/zones';
import {
  PRESET_COUNTERS,
  decrementCounter,
  enforceZoneCounterRules,
  mergeCounters,
  resolveCounterColor,
} from '../counters';
import { Zone } from '@/types';

const battlefield: Zone = { id: 'bf', type: ZONE.BATTLEFIELD, ownerId: 'p1', cardIds: [] };
const graveyard: Zone = { id: 'gy', type: ZONE.GRAVEYARD, ownerId: 'p1', cardIds: [] };

describe('counters helpers', () => {
  it('keeps counters on battlefield and strips elsewhere', () => {
    const counters = [{ type: '+1/+1', count: 2 }];
    expect(enforceZoneCounterRules(counters, battlefield)).toEqual(counters);
    expect(enforceZoneCounterRules(counters, graveyard)).toEqual([]);
  });

  it('merges counters by type', () => {
    const existing = [{ type: 'charge', count: 1 }];
    expect(mergeCounters(existing, { type: 'charge', count: 2 })).toEqual([{ type: 'charge', count: 3 }]);
    expect(mergeCounters(existing, { type: 'loyalty', count: 1 })).toEqual([
      { type: 'charge', count: 1 },
      { type: 'loyalty', count: 1 },
    ]);
  });

  it('decrements and removes counters', () => {
    const counters = [{ type: 'charge', count: 2 }];
    expect(decrementCounter(counters, 'charge')).toEqual([{ type: 'charge', count: 1 }]);
    expect(decrementCounter(counters, 'missing')).toEqual(counters);
    expect(decrementCounter([{ type: 'charge', count: 1 }], 'charge')).toEqual([]);
  });

  it('resolves counter colors using presets and globals', () => {
    const presetType = PRESET_COUNTERS[0].type;
    const presetColor = PRESET_COUNTERS[0].color;
    expect(resolveCounterColor(presetType, {})).toBe(presetColor);
    expect(resolveCounterColor('custom', { custom: '#123456' })).toBe('#123456');
    // Hashing should return some stable hex; ensure it returns a string.
    expect(typeof resolveCounterColor('another', {})).toBe('string');
  });

  it('strips counters when leaving battlefield via helper', () => {
    const counters = [{ type: 'charge', count: 2 }];
    const kept = enforceZoneCounterRules(counters, battlefield);
    const removed = enforceZoneCounterRules(counters, graveyard);
    expect(kept).toEqual(counters);
    expect(removed).toEqual([]);
  });
});
