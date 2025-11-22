export const SNAP_GRID_SIZE = 30;
export const SNAP_THRESHOLD = 0.5;

export const snapToGrid = (value: number): number => {
    const snapped = Math.floor(value / SNAP_GRID_SIZE + SNAP_THRESHOLD) * SNAP_GRID_SIZE;
    return snapped;
};

export const getSnappedPosition = (x: number, y: number) => {
    const snappedX = snapToGrid(x);
    const snappedY = snapToGrid(y);

    console.log(`  🔲 Grid Snap: (${x.toFixed(1)}, ${y.toFixed(1)}) → (${snappedX}, ${snappedY})`);
    console.log(`  🔲 Grid Square: [${snappedX / SNAP_GRID_SIZE}, ${snappedY / SNAP_GRID_SIZE}]`);

    return {
        x: snappedX,
        y: snappedY
    };
};
