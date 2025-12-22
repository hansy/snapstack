import { GRID_STEP_Y, clampNormalizedPosition } from './positions';

export type NormalizedPosition = { x: number; y: number };

const positionKey = (position: NormalizedPosition) => `${position.x.toFixed(4)}:${position.y.toFixed(4)}`;

const resolvePositionAgainstOccupied = ({
  targetPosition,
  occupied,
  maxAttempts,
}: {
  targetPosition: NormalizedPosition;
  occupied: Set<string>;
  maxAttempts: number;
}): NormalizedPosition => {
  const clampedTarget = clampNormalizedPosition(targetPosition);
  let candidate = clampedTarget;
  let attempts = 0;

  while (occupied.has(positionKey(candidate)) && attempts < maxAttempts) {
    candidate = clampNormalizedPosition({ x: candidate.x, y: candidate.y + GRID_STEP_Y });
    attempts += 1;
  }

  if (attempts >= maxAttempts) return clampedTarget;
  return candidate;
};

export const resolveBattlefieldCollisionPosition = ({
  movingCardId,
  targetPosition,
  orderedCardIds,
  getPosition,
  maxAttempts = 200,
}: {
  movingCardId: string;
  targetPosition: NormalizedPosition;
  orderedCardIds: string[];
  getPosition: (cardId: string) => NormalizedPosition | null | undefined;
  maxAttempts?: number;
}): NormalizedPosition => {
  const occupied = new Set<string>();
  orderedCardIds.forEach((id) => {
    if (id === movingCardId) return;
    const pos = getPosition(id);
    if (!pos) return;
    const clamped = clampNormalizedPosition(pos);
    occupied.add(positionKey(clamped));
  });

  return resolvePositionAgainstOccupied({
    targetPosition,
    occupied,
    maxAttempts,
  });
};

export const resolveBattlefieldGroupCollisionPositions = ({
  movingCardIds,
  targetPositions,
  orderedCardIds,
  getPosition,
  maxAttempts = 200,
}: {
  movingCardIds: string[];
  targetPositions: Record<string, NormalizedPosition | undefined>;
  orderedCardIds: string[];
  getPosition: (cardId: string) => NormalizedPosition | null | undefined;
  maxAttempts?: number;
}): Record<string, NormalizedPosition> => {
  if (movingCardIds.length === 0) return {};

  const movingSet = new Set(movingCardIds);
  const otherIds = orderedCardIds.filter((id) => !movingSet.has(id));
  const occupied = new Set<string>();

  for (const otherId of otherIds) {
    const pos = getPosition(otherId);
    if (!pos) continue;
    const clamped = clampNormalizedPosition(pos);
    occupied.add(positionKey(clamped));
  }

  const resolved: Record<string, NormalizedPosition> = {};
  const orderedMovingIds = movingCardIds.filter((id) => Boolean(targetPositions[id]));

  orderedMovingIds.forEach((id) => {
    const target = targetPositions[id];
    if (!target) return;
    const next = resolvePositionAgainstOccupied({
      targetPosition: target,
      occupied,
      maxAttempts,
    });
    resolved[id] = next;
    occupied.add(positionKey(next));
  });

  return resolved;
};
