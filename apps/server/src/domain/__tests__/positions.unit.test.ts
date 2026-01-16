import { describe, expect, it } from "vitest";

import {
  GRID_STEP_X,
  GRID_STEP_Y,
  LEGACY_BATTLEFIELD_HEIGHT,
  LEGACY_BATTLEFIELD_WIDTH,
} from "../constants";
import {
  findAvailablePositionNormalized,
  normalizeMovePosition,
  resolveBattlefieldCollisionPosition,
  resolveBattlefieldGroupCollisionPositions,
  resolvePositionAgainstOccupied,
} from "../positions";

const keyFor = (position: { x: number; y: number }) =>
  `${position.x.toFixed(4)}:${position.y.toFixed(4)}`;

describe("server positions", () => {
  it("should clamp negative normalized positions within bounds", () => {
    const result = normalizeMovePosition({ x: -0.25, y: 0.4 }, { x: 0.2, y: 0.2 });

    expect(result.x).toBe(0);
    expect(result.y).toBe(0.4);
  });

  it("should migrate legacy pixel positions when values exceed 1", () => {
    const result = normalizeMovePosition(
      { x: LEGACY_BATTLEFIELD_WIDTH / 2, y: LEGACY_BATTLEFIELD_HEIGHT / 2 },
      { x: 0, y: 0 }
    );

    expect(result.x).toBeCloseTo(0.5, 6);
    expect(result.y).toBeCloseTo(0.5, 6);
  });

  it("should fall back to the provided position when input is missing", () => {
    const result = normalizeMovePosition(undefined, { x: 0.3, y: 0.4 });

    expect(result).toEqual({ x: 0.3, y: 0.4 });
  });

  it("should return the target when it is unoccupied", () => {
    const target = { x: 0.25, y: 0.25 };
    const occupied = new Set<string>();

    expect(resolvePositionAgainstOccupied({ targetPosition: target, occupied, maxAttempts: 3 }))
      .toEqual(target);
  });

  it("should bump the position when the target is occupied", () => {
    const target = { x: 0.1, y: 0.1 };
    const occupied = new Set<string>([keyFor(target)]);

    const resolved = resolvePositionAgainstOccupied({ targetPosition: target, occupied, maxAttempts: 3 });

    expect(resolved.x).toBeCloseTo(target.x, 6);
    expect(resolved.y).toBeCloseTo(target.y + GRID_STEP_Y, 6);
  });

  it("should ignore the moving card when resolving battlefield collisions", () => {
    const target = { x: 0.2, y: 0.2 };
    const resolved = resolveBattlefieldCollisionPosition({
      movingCardId: "c1",
      targetPosition: target,
      orderedCardIds: ["c1"],
      getPosition: () => ({ x: 0.2, y: 0.2 }),
    });

    expect(resolved).toEqual(target);
  });

  it("should bump when another battlefield card already occupies the target", () => {
    const target = { x: 0.15, y: 0.15 };
    const resolved = resolveBattlefieldCollisionPosition({
      movingCardId: "c1",
      targetPosition: target,
      orderedCardIds: ["c1", "c2"],
      getPosition: (id) => (id === "c2" ? { x: 0.15, y: 0.15 } : null),
    });

    expect(resolved.x).toBeCloseTo(target.x, 6);
    expect(resolved.y).toBeCloseTo(target.y + GRID_STEP_Y, 6);
  });

  it("should resolve group collisions without overlapping outputs", () => {
    const targetPositions = {
      c1: { x: 0.4, y: 0.4 },
      c2: { x: 0.4, y: 0.4 },
    };

    const resolved = resolveBattlefieldGroupCollisionPositions({
      movingCardIds: ["c1", "c2"],
      targetPositions,
      orderedCardIds: ["c1", "c2", "c3"],
      getPosition: (id) => (id === "c3" ? { x: 0.4, y: 0.4 } : null),
    });

    expect(resolved.c1).toBeDefined();
    expect(resolved.c2).toBeDefined();
    expect(keyFor(resolved.c1)).not.toEqual(keyFor(resolved.c2));
  });

  it("should find the next available position when the start is occupied", () => {
    const cards = {
      c1: { position: { x: 0.5, y: 0.5 } },
    };

    const result = findAvailablePositionNormalized(
      { x: 0.5, y: 0.5 },
      ["c1"],
      cards
    );

    expect(result.x).toBeCloseTo(0.5 + GRID_STEP_X, 6);
    expect(result.y).toBeCloseTo(0.5 + GRID_STEP_Y, 6);
  });
});
