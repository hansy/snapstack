import { CARD_WIDTH_PX, CARD_HEIGHT_PX } from './constants';

export const SNAP_GRID_SIZE = 30;
export const SNAP_THRESHOLD = 0.5;

export const snapToGrid = (value: number): number => {
    const snapped = Math.floor(value / SNAP_GRID_SIZE + SNAP_THRESHOLD) * SNAP_GRID_SIZE;
    return snapped;
};

export const getSnappedPosition = (x: number, y: number) => {
    // Incoming x,y are the card center in zone space.
    // Snap the *top-left corner* to the grid, then convert back to center
    // so that card edges visually align with grid lines.
    const left = x - CARD_WIDTH_PX / 2;
    const top = y - CARD_HEIGHT_PX / 2;

    const snappedLeft = snapToGrid(left);
    const snappedTop = snapToGrid(top);

    return {
        x: snappedLeft + CARD_WIDTH_PX / 2,
        y: snappedTop + CARD_HEIGHT_PX / 2
    };
};
