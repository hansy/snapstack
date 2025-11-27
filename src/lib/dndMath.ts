import { DragPosition } from './dnd';

// True if a card centered at `center` stays fully inside the zone rectangle.
export const cardFitsWithinZone = (
    center: DragPosition,
    zoneWidth: number,
    zoneHeight: number,
    cardWidth: number,
    cardHeight: number
): boolean => {
    const halfW = cardWidth / 2;
    const halfH = cardHeight / 2;

    return (
        center.x - halfW >= 0 &&
        center.x + halfW <= zoneWidth &&
        center.y - halfH >= 0 &&
        center.y + halfH <= zoneHeight
    );
};

// Clamps a card center so the card stays inside the zone bounds.
export const clampToZoneBounds = (
    center: DragPosition,
    zoneWidth: number,
    zoneHeight: number,
    cardWidth: number,
    cardHeight: number
): DragPosition => {
    const halfW = cardWidth / 2;
    const halfH = cardHeight / 2;

    const minX = halfW;
    const maxX = Math.max(halfW, zoneWidth - halfW);
    const minY = halfH;
    const maxY = Math.max(halfH, zoneHeight - halfH);

    return {
        x: Math.min(Math.max(center.x, minX), maxX),
        y: Math.min(Math.max(center.y, minY), maxY)
    };
};
