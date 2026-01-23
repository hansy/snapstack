export * from "@mtg/shared/positions";

import {
    LEGACY_BATTLEFIELD_HEIGHT,
    LEGACY_BATTLEFIELD_WIDTH,
    clampNormalizedPosition,
    fromNormalizedPosition,
    toNormalizedPosition,
} from "@mtg/shared/positions";
import { clampToZoneBounds } from './dndMath';
import { snapToGrid } from './snapping';

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
