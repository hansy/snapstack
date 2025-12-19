import { Card, Zone } from '@/types';
import { ZONE } from '@/constants/zones';

export interface DragPosition {
    x: number;
    y: number;
}

export interface DragOffset {
    x: number;
    y: number;
}

/**
 * Extracts the pointer coordinates from a drag event (mouse or touch).
 */
export const getEventCoordinates = (event: any): DragPosition | null => {
    const activator = event.activatorEvent || event?.active?.activatorEvent;
    if (!activator) return null;

    if (typeof activator.clientX === 'number' && typeof activator.clientY === 'number') {
        return { x: activator.clientX, y: activator.clientY };
    }
    if (activator.touches && activator.touches[0]) {
        return { x: activator.touches[0].clientX, y: activator.touches[0].clientY };
    }
    return null;
};

/**
 * Calculates the offset from the pointer to the center of the element.
 */
export const calculatePointerOffset = (
    pointer: DragPosition,
    rect: { left: number; top: number; width: number; height: number }
): DragOffset => {
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    return {
        x: centerX - pointer.x,
        y: centerY - pointer.y,
    };
};

/**
 * Calculates the position of the dragged item relative to the target zone,
 * accounting for the zone's position and scale.
 */
export const calculateRelativePosition = (
    pointerStart: DragPosition,
    pointerOffset: DragOffset,
    delta: DragOffset,
    overRect: { left: number; top: number },
    scale: number = 1
): DragPosition => {
    const centerScreen = {
        x: pointerStart.x + delta.x + pointerOffset.x,
        y: pointerStart.y + delta.y + pointerOffset.y,
    };

    return {
        x: (centerScreen.x - overRect.left) / scale,
        y: (centerScreen.y - overRect.top) / scale,
    };
};

/**
 * Checks if a card can be dropped into a specific zone.
 */
export const canDropToZone = (activeCard: Card, targetZone: Zone): boolean => {
    // Permission Check
    const isBattlefield = targetZone.type === ZONE.BATTLEFIELD;
    const isOwner = targetZone.ownerId === activeCard.ownerId;

    // Allow dropping on any battlefield or any zone owned by the player
    return isBattlefield || isOwner;
};
