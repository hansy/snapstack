export const SNAP_GRID_SIZE = 30;
export const SNAP_THRESHOLD = 0.5;

export const snapToGrid = (value: number): number => {
    const snapped = Math.floor(value / SNAP_GRID_SIZE + SNAP_THRESHOLD) * SNAP_GRID_SIZE;
    return snapped;
};

export const getSnappedPosition = (x: number, y: number) => {
    const snappedX = snapToGrid(x);
    const snappedY = snapToGrid(y);

    return {
        x: snappedX,
        y: snappedY
    };
};
