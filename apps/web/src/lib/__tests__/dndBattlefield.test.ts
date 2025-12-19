import { describe, expect, it } from 'vitest';

import { computeBattlefieldPlacement, detectBattlefieldZoomEdge } from '../dndBattlefield';

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

      // x should remain 100 (already aligned), y snaps from 100 -> 90 with the default grid.
      expect(result.ghostPosition.x).toBeCloseTo(100);
      expect(result.ghostPosition.y).toBeCloseTo(90);
      expect(result.snappedCanonical.x).toBeCloseTo(100 / 600);
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

  describe('detectBattlefieldZoomEdge', () => {
    it('detects top/bottom/left/right edges in order', () => {
      const overRect = { top: 0, bottom: 400, left: 0, right: 600 };

      expect(
        detectBattlefieldZoomEdge(
          { top: 10, bottom: 110, left: 100, right: 200 },
          overRect,
          30
        )
      ).toBe('top');

      expect(
        detectBattlefieldZoomEdge(
          { top: 100, bottom: 395, left: 100, right: 200 },
          overRect,
          30
        )
      ).toBe('bottom');

      expect(
        detectBattlefieldZoomEdge(
          { top: 100, bottom: 200, left: 10, right: 110 },
          overRect,
          30
        )
      ).toBe('left');

      expect(
        detectBattlefieldZoomEdge(
          { top: 100, bottom: 200, left: 100, right: 595 },
          overRect,
          30
        )
      ).toBe('right');
    });
  });
});
