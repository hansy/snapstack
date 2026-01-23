// Core dimensions
export const CARD_ASPECT_RATIO = 2 / 3; // 10/15 = 2/3 for clean math
export const BASE_CARD_HEIGHT = 120; // Base height in px

export const LEGACY_BATTLEFIELD_WIDTH = 1000;
export const LEGACY_BATTLEFIELD_HEIGHT = 600;

const BASE_CARD_WIDTH = BASE_CARD_HEIGHT * CARD_ASPECT_RATIO;
export const GRID_STEP_X = (BASE_CARD_WIDTH / 2) / LEGACY_BATTLEFIELD_WIDTH;
export const GRID_STEP_Y = (BASE_CARD_HEIGHT / 4) / LEGACY_BATTLEFIELD_HEIGHT;
