// Core dimensions
export const CARD_ASPECT_RATIO = 2 / 3; // 10/15 = 2/3 for clean math
export const BASE_CARD_HEIGHT = 120; // Base height in px

// Derived helper
export const getCardWidth = (height: number) => height * CARD_ASPECT_RATIO;

// Tailwind classes (derived from base)
export const CARD_HEIGHT_CLASS = 'h-[120px]';
export const CARD_ASPECT_CLASS = 'aspect-[2/3]';
export const ZONE_BASE_CLASSES = `${CARD_HEIGHT_CLASS} ${CARD_ASPECT_CLASS}`;
export const ZONE_SIDEWAYS_CLASSES = `w-[120px] aspect-[3/2]`;

// Legacy aliases for backwards compatibility during migration
// TODO: Remove these after all usages are updated
export const CARD_HEIGHT = CARD_HEIGHT_CLASS;
export const CARD_ASPECT_RATIO_CLASS = CARD_ASPECT_CLASS;
