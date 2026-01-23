import { describe, expect, it } from 'vitest';

import * as shared from '@mtg/shared/positions';
import * as web from '@/lib/positions';

describe('positions parity', () => {
  it('matches grid constants', () => {
    expect(web.GRID_STEP_X).toBe(shared.GRID_STEP_X);
    expect(web.GRID_STEP_Y).toBe(shared.GRID_STEP_Y);
    expect(web.LEGACY_BATTLEFIELD_WIDTH).toBe(shared.LEGACY_BATTLEFIELD_WIDTH);
    expect(web.LEGACY_BATTLEFIELD_HEIGHT).toBe(shared.LEGACY_BATTLEFIELD_HEIGHT);
  });

  it('matches clampNormalizedPosition', () => {
    const input = { x: -0.25, y: 1.25 };
    expect(web.clampNormalizedPosition(input)).toEqual(shared.clampNormalizedPosition(input));
  });

  it('matches normalizeMovePosition', () => {
    const position = { x: 500, y: 300 };
    const fallback = { x: 0.1, y: 0.1 };
    expect(web.normalizeMovePosition(position, fallback)).toEqual(
      shared.normalizeMovePosition(position, fallback)
    );
  });

  it('matches positionsRoughlyEqual', () => {
    const a = { x: 0.5, y: 0.5 };
    const b = { x: 0.50001, y: 0.49999 };
    expect(web.positionsRoughlyEqual(a, b)).toBe(shared.positionsRoughlyEqual(a, b));
  });

  it('matches findAvailablePositionNormalized', () => {
    const cards = {
      c1: { position: { x: 0.5, y: 0.5 } },
      c2: { position: { x: 0.5, y: 0.55 } },
    };
    const zoneCardIds = Object.keys(cards);
    const start = { x: 0.5, y: 0.5 };

    expect(web.findAvailablePositionNormalized(start, zoneCardIds, cards)).toEqual(
      shared.findAvailablePositionNormalized(start, zoneCardIds, cards)
    );
  });
});
