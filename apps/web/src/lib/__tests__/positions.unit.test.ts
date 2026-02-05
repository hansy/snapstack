import { describe, expect, it } from 'vitest';

import {
  BASE_CARD_HEIGHT,
  CARD_ASPECT_RATIO,
  GRID_STEP_X,
  GRID_STEP_Y,
  LEGACY_BATTLEFIELD_HEIGHT,
  LEGACY_BATTLEFIELD_WIDTH,
  clampNormalizedPosition,
  getNormalizedGridSteps,
  getCardPixelSize,
  findAvailablePositionNormalized,
  normalizeMovePosition,
  positionsRoughlyEqual,
} from '@/lib/positions';

describe('positions', () => {
  it('exposes expected grid constants', () => {
    const baseWidth = BASE_CARD_HEIGHT * CARD_ASPECT_RATIO;
    expect(LEGACY_BATTLEFIELD_WIDTH).toBe(1000);
    expect(LEGACY_BATTLEFIELD_HEIGHT).toBe(600);
    expect(GRID_STEP_X).toBeCloseTo((baseWidth / 2) / LEGACY_BATTLEFIELD_WIDTH, 8);
    expect(GRID_STEP_Y).toBeCloseTo((BASE_CARD_HEIGHT / 4) / LEGACY_BATTLEFIELD_HEIGHT, 8);
  });

  it('clamps normalized positions to [0,1]', () => {
    expect(clampNormalizedPosition({ x: -0.25, y: 1.25 })).toEqual({ x: 0, y: 1 });
  });

  it('normalizes legacy pixel coordinates to the legacy battlefield size', () => {
    const position = { x: 500, y: 300 };
    const fallback = { x: 0.1, y: 0.1 };
    const normalized = normalizeMovePosition(position, fallback);
    expect(normalized.x).toBeCloseTo(0.5, 6);
    expect(normalized.y).toBeCloseTo(0.5, 6);
  });

  it('compares positions with a small epsilon tolerance', () => {
    const a = { x: 0.5, y: 0.5 };
    const b = { x: 0.50001, y: 0.49999 };
    expect(positionsRoughlyEqual(a, b)).toBe(true);
  });

  it('finds the next available position when the start is occupied', () => {
    const cards = {
      c1: { position: { x: 0.5, y: 0.5 } },
      c2: { position: { x: 0.5, y: 0.55 } },
    };
    const zoneCardIds = Object.keys(cards);
    const start = { x: 0.5, y: 0.5 };

    const resolved = findAvailablePositionNormalized(start, zoneCardIds, cards);
    expect(resolved.x).toBeCloseTo(0.5 + GRID_STEP_X, 6);
    expect(resolved.y).toBeCloseTo(0.5 + GRID_STEP_Y, 6);
  });

  it('computes card pixel size with a custom base height and width', () => {
    const { cardWidth, cardHeight } = getCardPixelSize({
      baseCardHeight: 160,
      baseCardWidth: 120,
    });
    expect(cardHeight).toBeCloseTo(160, 6);
    expect(cardWidth).toBeCloseTo(120, 6);
  });

  it('computes normalized grid steps using base card size and view scale', () => {
    const { stepX, stepY } = getNormalizedGridSteps({
      baseCardHeight: 160,
      baseCardWidth: 120,
      viewScale: 1.25,
      zoneWidth: 800,
      zoneHeight: 640,
    });
    expect(stepX).toBeCloseTo(((120 * 1.25) / 2) / 800, 6);
    expect(stepY).toBeCloseTo(((160 * 1.25) / 4) / 640, 6);
  });
});
