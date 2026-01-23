import {
  BASE_CARD_HEIGHT,
  CARD_ASPECT_RATIO,
  GRID_STEP_X,
  GRID_STEP_Y,
  LEGACY_BATTLEFIELD_HEIGHT,
  LEGACY_BATTLEFIELD_WIDTH,
} from "./constants/geometry";

export {
  BASE_CARD_HEIGHT,
  CARD_ASPECT_RATIO,
  GRID_STEP_X,
  GRID_STEP_Y,
  LEGACY_BATTLEFIELD_HEIGHT,
  LEGACY_BATTLEFIELD_WIDTH,
};

export const clampNumber = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export const clamp01 = (value: number) => clampNumber(value, 0, 1);

export const clampNormalizedPosition = (position: { x: number; y: number }) => ({
  x: clamp01(position.x),
  y: clamp01(position.y),
});

export const migratePositionToNormalized = (position: { x: number; y: number }) =>
  clampNormalizedPosition({
    x: LEGACY_BATTLEFIELD_WIDTH ? position.x / LEGACY_BATTLEFIELD_WIDTH : 0,
    y: LEGACY_BATTLEFIELD_HEIGHT ? position.y / LEGACY_BATTLEFIELD_HEIGHT : 0,
  });

export const normalizeMovePosition = (
  position: { x: number; y: number } | undefined,
  fallback: { x: number; y: number }
) => {
  const normalizedInput =
    position && (position.x > 1 || position.y > 1)
      ? migratePositionToNormalized(position)
      : position;
  return clampNormalizedPosition(normalizedInput ?? fallback);
};

export const getCardPixelSize = (params?: { viewScale?: number; isTapped?: boolean }) => {
  const viewScale = params?.viewScale ?? 1;
  const isTapped = params?.isTapped ?? false;
  const baseWidth = BASE_CARD_HEIGHT * CARD_ASPECT_RATIO;
  const cardWidth = (isTapped ? BASE_CARD_HEIGHT : baseWidth) * viewScale;
  const cardHeight = (isTapped ? baseWidth : BASE_CARD_HEIGHT) * viewScale;
  return { cardWidth, cardHeight };
};

export const getNormalizedGridSteps = (params?: {
  isTapped?: boolean;
  zoneWidth?: number;
  zoneHeight?: number;
}) => {
  const { cardWidth, cardHeight } = getCardPixelSize({
    isTapped: params?.isTapped,
  });
  const zoneWidth = params?.zoneWidth ?? LEGACY_BATTLEFIELD_WIDTH;
  const zoneHeight = params?.zoneHeight ?? LEGACY_BATTLEFIELD_HEIGHT;
  return {
    stepX: zoneWidth ? (cardWidth / 2) / zoneWidth : 0,
    stepY: zoneHeight ? (cardHeight / 4) / zoneHeight : 0,
  };
};

export const normalizedPositionKey = (position: { x: number; y: number }) =>
  `${position.x.toFixed(4)}:${position.y.toFixed(4)}`;

const positionKey = normalizedPositionKey;

export const toNormalizedPosition = (
  position: { x: number; y: number },
  zoneWidth: number = LEGACY_BATTLEFIELD_WIDTH,
  zoneHeight: number = LEGACY_BATTLEFIELD_HEIGHT
) => ({
  x: clamp01(zoneWidth ? position.x / zoneWidth : 0),
  y: clamp01(zoneHeight ? position.y / zoneHeight : 0),
});

export const fromNormalizedPosition = (
  position: { x: number; y: number },
  zoneWidth: number,
  zoneHeight: number
) => ({
  x: position.x * zoneWidth,
  y: position.y * zoneHeight,
});

/**
 * Mirror a normalized position vertically (flip Y in [0,1]).
 * Useful for rendering an opponent's battlefield from your perspective
 * while keeping stored coordinates canonical.
 */
export const mirrorNormalizedY = (position: { x: number; y: number }) =>
  clampNormalizedPosition({
    x: position.x,
    y: 1 - position.y,
  });

export const positionsRoughlyEqual = (
  a: { x: number; y: number },
  b: { x: number; y: number },
  epsilon = 1e-4
) => Math.abs(a.x - b.x) <= epsilon && Math.abs(a.y - b.y) <= epsilon;

export const resolvePositionAgainstOccupied = ({
  targetPosition,
  occupied,
  maxAttempts,
  stepY = GRID_STEP_Y,
}: {
  targetPosition: { x: number; y: number };
  occupied: Set<string>;
  maxAttempts: number;
  stepY?: number;
}) => {
  const clampedTarget = clampNormalizedPosition(targetPosition);
  let candidate = clampedTarget;
  let attempts = 0;

  while (occupied.has(positionKey(candidate)) && attempts < maxAttempts) {
    candidate = clampNormalizedPosition({ x: candidate.x, y: candidate.y + stepY });
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
  stepY = GRID_STEP_Y,
  maxAttempts = 200,
}: {
  movingCardId: string;
  targetPosition: { x: number; y: number };
  orderedCardIds: string[];
  getPosition: (cardId: string) => { x: number; y: number } | null | undefined;
  stepY?: number;
  maxAttempts?: number;
}) => {
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
    stepY,
  });
};

export const resolveBattlefieldGroupCollisionPositions = ({
  movingCardIds,
  targetPositions,
  orderedCardIds,
  getPosition,
  getStepY,
  stepY = GRID_STEP_Y,
  maxAttempts = 200,
}: {
  movingCardIds: string[];
  targetPositions: Record<string, { x: number; y: number } | undefined>;
  orderedCardIds: string[];
  getPosition: (cardId: string) => { x: number; y: number } | null | undefined;
  getStepY?: (cardId: string) => number | undefined;
  stepY?: number;
  maxAttempts?: number;
}) => {
  if (movingCardIds.length === 0) return {} as Record<string, { x: number; y: number }>;

  const movingSet = new Set(movingCardIds);
  const otherIds = orderedCardIds.filter((id) => !movingSet.has(id));
  const occupied = new Set<string>();

  for (const otherId of otherIds) {
    const pos = getPosition(otherId);
    if (!pos) continue;
    const clamped = clampNormalizedPosition(pos);
    occupied.add(positionKey(clamped));
  }

  const resolved: Record<string, { x: number; y: number }> = {};
  const orderedMovingIds = movingCardIds.filter((id) => Boolean(targetPositions[id]));

  orderedMovingIds.forEach((id) => {
    const target = targetPositions[id];
    if (!target) return;
    const next = resolvePositionAgainstOccupied({
      targetPosition: target,
      occupied,
      maxAttempts,
      stepY: getStepY?.(id) ?? stepY,
    });
    resolved[id] = next;
    occupied.add(positionKey(next));
  });

  return resolved;
};

export const bumpPosition = (
  position: { x: number; y: number },
  dx: number = GRID_STEP_X,
  dy: number = GRID_STEP_Y
) => clampNormalizedPosition({ x: position.x + dx, y: position.y + dy });

export const findAvailablePositionNormalized = (
  start: { x: number; y: number },
  zoneCardIds: string[],
  cards: Record<string, { position: { x: number; y: number } }>,
  stepX: number = GRID_STEP_X,
  stepY: number = GRID_STEP_Y,
  maxChecks: number = 50
) => {
  const occupied = new Set<string>();
  zoneCardIds.forEach((id) => {
    const card = cards[id];
    if (card) {
      occupied.add(positionKey(clampNormalizedPosition(card.position)));
    }
  });

  let candidate = clampNormalizedPosition(start);
  let attempts = 0;
  while (occupied.has(positionKey(candidate)) && attempts < maxChecks) {
    candidate = clampNormalizedPosition({ x: candidate.x + stepX, y: candidate.y + stepY });
    attempts += 1;
  }

  return candidate;
};
