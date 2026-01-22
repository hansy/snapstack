import { describe, expect, it } from 'vitest';

import { computeBattlefieldPlacement } from '../dndBattlefield';

describe('dndBattlefield', () => {
  describe('computeBattlefieldPlacement', () => {
    it('snaps and returns ghost position in zone space', () => {
      const result = computeBattlefieldPlacement({
        centerScreen: { x: 100, y: 100 },
        overRect: {
          left: 0,
          top: 0,
          right: 600,
          bottom: 400,
          width: 600,
          height: 400,
        },
        zoneScale: 1,
        viewScale: 1,
        mirrorY: false,
        isTapped: false,
      });

      // x snaps from 100 -> 120, y snaps from 100 -> 90 with the card-sized grid.
      expect(result.ghostPosition.x).toBeCloseTo(120);
      expect(result.ghostPosition.y).toBeCloseTo(90);
      expect(result.snappedCanonical.x).toBeCloseTo(120 / 600);
      expect(result.snappedCanonical.y).toBeCloseTo(90 / 400);
    });

    it('clamps near the edges so the card stays within bounds', () => {
      const result = computeBattlefieldPlacement({
        centerScreen: { x: 5, y: 5 },
        overRect: {
          left: 0,
          top: 0,
          right: 600,
          bottom: 400,
          width: 600,
          height: 400,
        },
        zoneScale: 1,
        viewScale: 1,
        mirrorY: false,
        isTapped: false,
      });

      expect(result.ghostPosition.x).toBeGreaterThanOrEqual(result.cardWidth / 2);
      expect(result.ghostPosition.y).toBeGreaterThanOrEqual(result.cardHeight / 2);
    });

    it('keeps canonical snapping independent of view scale', () => {
      const result = computeBattlefieldPlacement({
        centerScreen: { x: 100, y: 100 },
        overRect: {
          left: 0,
          top: 0,
          right: 600,
          bottom: 400,
          width: 600,
          height: 400,
        },
        zoneScale: 1,
        viewScale: 0.5,
        mirrorY: false,
        isTapped: false,
      });

      expect(result.snappedCanonical.x).toBeCloseTo(120 / 600);
      expect(result.snappedCanonical.y).toBeCloseTo(90 / 400);
      expect(result.ghostPosition.x).toBeCloseTo(100);
      expect(result.ghostPosition.y).toBeCloseTo(105);
    });

    it('returns a canonical snapped position while mirroring ghost rendering for the viewer', () => {
      const baseParams = {
        centerScreen: { x: 100, y: 100 },
        overRect: {
          left: 0,
          top: 0,
          right: 600,
          bottom: 400,
          width: 600,
          height: 400,
        },
        zoneScale: 1,
        viewScale: 1,
        isTapped: false,
      } as const;

      const normal = computeBattlefieldPlacement({ ...baseParams, mirrorY: false });
      expect(normal.ghostPosition.x / normal.zoneWidth).toBeCloseTo(normal.snappedCanonical.x);
      expect(normal.ghostPosition.y / normal.zoneHeight).toBeCloseTo(normal.snappedCanonical.y);

      const mirrored = computeBattlefieldPlacement({ ...baseParams, mirrorY: true });
      expect(mirrored.ghostPosition.x / mirrored.zoneWidth).toBeCloseTo(mirrored.snappedCanonical.x);
      expect(mirrored.ghostPosition.y / mirrored.zoneHeight).toBeCloseTo(1 - mirrored.snappedCanonical.y);
    });
  });

});
