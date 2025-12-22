import { describe, expect, it } from 'vitest';
import { GRID_STEP_Y, clampNormalizedPosition } from '../positions';
import {
  resolveBattlefieldCollisionPosition,
  resolveBattlefieldGroupCollisionPositions,
} from '../battlefieldCollision';

describe('resolveBattlefieldCollisionPosition', () => {
  it('returns the target when nothing overlaps', () => {
    const position = resolveBattlefieldCollisionPosition({
      movingCardId: 'c1',
      targetPosition: { x: 0.5, y: 0.5 },
      orderedCardIds: ['c1', 'c2'],
      getPosition: (id) => (id === 'c2' ? { x: 0.25, y: 0.25 } : null),
    });

    expect(position).toEqual({ x: 0.5, y: 0.5 });
  });

  it('moves the incoming card down by one grid step when occupied', () => {
    const position = resolveBattlefieldCollisionPosition({
      movingCardId: 'c1',
      targetPosition: { x: 0.5, y: 0.5 },
      orderedCardIds: ['c1', 'c2'],
      getPosition: (id) => (id === 'c2' ? { x: 0.5, y: 0.5 } : null),
    });

    expect(position).toEqual(
      clampNormalizedPosition({ x: 0.5, y: 0.5 + GRID_STEP_Y })
    );
  });

  it('cascades until a free spot is found', () => {
    const target = { x: 0.5, y: 0.5 };
    const occupied = clampNormalizedPosition({ x: 0.5, y: target.y + GRID_STEP_Y });

    const position = resolveBattlefieldCollisionPosition({
      movingCardId: 'c1',
      targetPosition: target,
      orderedCardIds: ['c1', 'c2', 'c3'],
      getPosition: (id) => {
        if (id === 'c2') return target;
        if (id === 'c3') return occupied;
        return null;
      },
    });

    expect(position.x).toBeCloseTo(0.5, 6);
    expect(position.y).toBeCloseTo(target.y + GRID_STEP_Y * 2, 6);
  });

  it('keeps the original target if no free spot is found', () => {
    const position = resolveBattlefieldCollisionPosition({
      movingCardId: 'c1',
      targetPosition: { x: 0.5, y: 1 },
      orderedCardIds: ['c1', 'c2'],
      getPosition: (id) => (id === 'c2' ? { x: 0.5, y: 1 } : null),
      maxAttempts: 3,
    });

    expect(position).toEqual({ x: 0.5, y: 1 });
  });
});

describe('resolveBattlefieldGroupCollisionPositions', () => {
  it('moves only colliding moved cards and leaves others unchanged', () => {
    const resolved = resolveBattlefieldGroupCollisionPositions({
      movingCardIds: ['m1', 'm2'],
      targetPositions: {
        m1: { x: 0.5, y: 0.5 },
        m2: { x: 0.25, y: 0.25 },
      },
      orderedCardIds: ['m1', 'm2', 'c1'],
      getPosition: (id) => (id === 'c1' ? { x: 0.5, y: 0.5 } : null),
    });

    expect(resolved.m1).toEqual(
      clampNormalizedPosition({ x: 0.5, y: 0.5 + GRID_STEP_Y })
    );
    expect(resolved.m2).toEqual({ x: 0.25, y: 0.25 });
  });

  it('avoids collisions among moved cards', () => {
    const resolved = resolveBattlefieldGroupCollisionPositions({
      movingCardIds: ['m1', 'm2'],
      targetPositions: {
        m1: { x: 0.5, y: 0.5 },
        m2: { x: 0.5, y: 0.5 },
      },
      orderedCardIds: ['m1', 'm2'],
      getPosition: () => null,
    });

    expect(resolved.m1).toEqual({ x: 0.5, y: 0.5 });
    expect(resolved.m2).toEqual(
      clampNormalizedPosition({ x: 0.5, y: 0.5 + GRID_STEP_Y })
    );
  });
});
