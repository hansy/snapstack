import { describe, expect, it } from 'vitest';
import { GRID_STEP_Y, clampNormalizedPosition } from '../positions';
import { computeBattlefieldCollisionPatches } from '../battlefieldCollision';

describe('computeBattlefieldCollisionPatches', () => {
  it('returns no patches when nothing overlaps', () => {
    const patches = computeBattlefieldCollisionPatches({
      movingCardId: 'c1',
      targetPosition: { x: 0.5, y: 0.5 },
      orderedCardIds: ['c1', 'c2'],
      getPosition: (id) => (id === 'c2' ? { x: 0.25, y: 0.25 } : null),
    });

    expect(patches).toEqual([]);
  });

  it('shifts an overlapping card down by one grid step', () => {
    const patches = computeBattlefieldCollisionPatches({
      movingCardId: 'c1',
      targetPosition: { x: 0.5, y: 0.5 },
      orderedCardIds: ['c1', 'c2'],
      getPosition: (id) => (id === 'c2' ? { x: 0.5, y: 0.5 } : null),
    });

    expect(patches).toEqual([
      { id: 'c2', position: clampNormalizedPosition({ x: 0.5, y: 0.5 + GRID_STEP_Y }) },
    ]);
  });

  it('cascades until a free spot is found', () => {
    const target = { x: 0.5, y: 0.5 };
    const occupied = clampNormalizedPosition({ x: 0.5, y: target.y + GRID_STEP_Y });

    const patches = computeBattlefieldCollisionPatches({
      movingCardId: 'c1',
      targetPosition: target,
      orderedCardIds: ['c1', 'c2', 'c3'],
      getPosition: (id) => {
        if (id === 'c2') return target; // overlaps, should move
        if (id === 'c3') return occupied; // blocks first candidate
        return null;
      },
    });

    expect(patches).toHaveLength(1);
    expect(patches[0]?.id).toBe('c2');
    expect(patches[0]?.position.x).toBeCloseTo(0.5, 6);
    expect(patches[0]?.position.y).toBeCloseTo(target.y + GRID_STEP_Y * 2, 6);
  });

  it('gives up when clamping prevents finding a free spot', () => {
    const patches = computeBattlefieldCollisionPatches({
      movingCardId: 'c1',
      targetPosition: { x: 0.5, y: 1 },
      orderedCardIds: ['c1', 'c2'],
      getPosition: (id) => (id === 'c2' ? { x: 0.5, y: 1 } : null),
      maxAttempts: 3,
    });

    expect(patches).toEqual([]);
  });
});
