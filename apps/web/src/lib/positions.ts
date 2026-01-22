import { clampToZoneBounds } from './dndMath';
import { snapToGrid } from './snapping';
import { BASE_CARD_HEIGHT, CARD_ASPECT_RATIO } from './constants';

export const LEGACY_BATTLEFIELD_WIDTH = 1000;
export const LEGACY_BATTLEFIELD_HEIGHT = 600;

// Grid steps expressed as normalized units (relative to a legacy 1000x600 battlefield).
const BASE_CARD_WIDTH = BASE_CARD_HEIGHT * CARD_ASPECT_RATIO;
export const GRID_STEP_X = (BASE_CARD_WIDTH / 2) / LEGACY_BATTLEFIELD_WIDTH;
export const GRID_STEP_Y = (BASE_CARD_HEIGHT / 4) / LEGACY_BATTLEFIELD_HEIGHT;

export const getCardPixelSize = (params?: { viewScale?: number; isTapped?: boolean }) => {
    const viewScale = params?.viewScale ?? 1;
    const isTapped = params?.isTapped ?? false;
    const cardWidth = (isTapped ? BASE_CARD_HEIGHT : BASE_CARD_WIDTH) * viewScale;
    const cardHeight = (isTapped ? BASE_CARD_WIDTH : BASE_CARD_HEIGHT) * viewScale;
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

const clamp01 = (value: number) => Math.min(Math.max(value, 0), 1);

export const normalizedPositionKey = (position: { x: number; y: number }) =>
    `${position.x.toFixed(4)}:${position.y.toFixed(4)}`;

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

export const clampNormalizedPosition = (position: { x: number; y: number }) => ({
    x: clamp01(position.x),
    y: clamp01(position.y),
});

/**
 * Mirror a normalized position vertically (flip Y in [0,1]).
 * Useful for rendering an opponent's battlefield from your perspective
 * while keeping stored coordinates canonical.
 */
export const mirrorNormalizedY = (position: { x: number; y: number }) => clampNormalizedPosition({
    x: position.x,
    y: 1 - position.y,
});

export const positionsRoughlyEqual = (a: { x: number; y: number }, b: { x: number; y: number }, epsilon = 1e-4) =>
    Math.abs(a.x - b.x) <= epsilon && Math.abs(a.y - b.y) <= epsilon;

export const bumpPosition = (
    position: { x: number; y: number },
    dx: number = GRID_STEP_X,
    dy: number = GRID_STEP_Y
) => clampNormalizedPosition({ x: position.x + dx, y: position.y + dy });

/**
 * Snap a normalized position against a zone's current pixel size, then clamp
 * to ensure the card fits within bounds.
 */
export const snapNormalizedWithZone = (
    position: { x: number; y: number },
    zoneWidth: number,
    zoneHeight: number,
    cardWidth: number,
    cardHeight: number
) => {
    if (!zoneWidth || !zoneHeight) return clampNormalizedPosition(position);

    const asPixels = fromNormalizedPosition(position, zoneWidth, zoneHeight);

    const gridX = cardWidth / 2;
    const gridY = cardHeight / 4;

    // Snap using scaled grid steps, matching visual card size.
    const left = asPixels.x - cardWidth / 2;
    const top = asPixels.y - cardHeight / 2;
    const snappedLeft = snapToGrid(left, gridX);
    const snappedTop = snapToGrid(top, gridY);
    const snappedCenter = {
        x: snappedLeft + cardWidth / 2,
        y: snappedTop + cardHeight / 2
    };

    const clampedPixels = clampToZoneBounds(snappedCenter, zoneWidth, zoneHeight, cardWidth, cardHeight);
    return toNormalizedPosition(clampedPixels, zoneWidth, zoneHeight);
};

/**
 * Snap a normalized position using the legacy battlefield size as the pixel reference.
 * This is useful for migrations or operations that don't have a live DOM size available.
 */
export const snapNormalizedLegacy = (
    position: { x: number; y: number },
    cardWidth: number,
    cardHeight: number
) => snapNormalizedWithZone(position, LEGACY_BATTLEFIELD_WIDTH, LEGACY_BATTLEFIELD_HEIGHT, cardWidth, cardHeight);

/**
 * Convert any legacy pixel positions into normalized form, clamping to [0,1].
 */
export const migratePositionToNormalized = (position: { x: number; y: number }) =>
    toNormalizedPosition(position, LEGACY_BATTLEFIELD_WIDTH, LEGACY_BATTLEFIELD_HEIGHT);

export const findAvailablePositionNormalized = (
    start: { x: number; y: number },
    zoneCardIds: string[],
    cards: Record<string, { position: { x: number; y: number } }>,
    stepX: number = GRID_STEP_X,
    stepY: number = GRID_STEP_Y,
    maxChecks: number = 50
) => {
    const occupied = new Set<string>();
    zoneCardIds.forEach(id => {
        const card = cards[id];
        if (card) {
            occupied.add(normalizedPositionKey(card.position));
        }
    });

    let candidate = clampNormalizedPosition(start);
    let attempts = 0;
    while (occupied.has(normalizedPositionKey(candidate)) && attempts < maxChecks) {
        candidate = clampNormalizedPosition({ x: candidate.x + stepX, y: candidate.y + stepY });
        attempts += 1;
    }

    return candidate;
};
