export const CARD_HEIGHT = 'h-32';
export const CARD_ASPECT_RATIO = 'aspect-[11/15]';
export const CARD_WIDTH = 'w-auto'; // Let aspect ratio drive width

// Base classes for zones that should match card dimensions
export const ZONE_BASE_CLASSES = `${CARD_HEIGHT} ${CARD_ASPECT_RATIO}`;
export const ZONE_SIDEWAYS_CLASSES = `w-32 aspect-[15/11]`;

// Numeric logical dimensions (px) for calculations (center/positioning/snap)
export const CARD_HEIGHT_PX = 128; // tailwind h-32
export const CARD_WIDTH_PX = 94; // 128 * 11/15 ≈ 93.8
