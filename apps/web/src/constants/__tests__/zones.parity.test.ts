import { describe, expect, it } from 'vitest';

import * as shared from '@mtg/shared/constants/zones';
import * as web from '@/constants/zones';

const zoneTypes = Object.values(shared.ZONE);

describe('zone constants parity', () => {
  it('matches zone identifiers', () => {
    expect(web.ZONE).toEqual(shared.ZONE);
  });

  it('matches commander zone helper', () => {
    expect(web.isCommanderZoneType(shared.ZONE.COMMANDER)).toBe(true);
    expect(web.isCommanderZoneType(shared.LEGACY_COMMAND_ZONE)).toBe(true);
    expect(web.isCommanderZoneType(shared.ZONE.HAND)).toBe(false);
  });

  it('matches hidden/public zone helpers from shared', () => {
    zoneTypes.forEach((zoneType) => {
      expect(shared.isHiddenZoneType(zoneType)).toBe(!shared.isPublicZoneType(zoneType));
    });
  });
});
