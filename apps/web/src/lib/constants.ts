import {
  BASE_CARD_HEIGHT,
  CARD_ASPECT_RATIO,
  LEGACY_BATTLEFIELD_HEIGHT,
  LEGACY_BATTLEFIELD_WIDTH,
} from "@mtg/shared/constants/geometry";

// Core dimensions
export { BASE_CARD_HEIGHT, CARD_ASPECT_RATIO };

// Derived helper
export const getCardWidth = (height: number) => height * CARD_ASPECT_RATIO;

// Tailwind classes (derived from base)
export const CARD_HEIGHT_CLASS = 'h-[120px]';
export const CARD_ASPECT_CLASS = 'aspect-[2/3]';
export const ZONE_BASE_CLASSES = `${CARD_HEIGHT_CLASS} ${CARD_ASPECT_CLASS}`;
export const ZONE_SIDEWAYS_CLASSES = `w-[120px] aspect-[3/2]`;

// Layout baselines
export const BOARD_BASE_WIDTH = LEGACY_BATTLEFIELD_WIDTH;
export const BOARD_BASE_HEIGHT = LEGACY_BATTLEFIELD_HEIGHT;

// Zone viewer card sizing
export const ZONE_VIEWER_CARD_WIDTH = 180;
export const ZONE_VIEWER_CARD_HEIGHT = 252;
export const ZONE_VIEWER_STACK_OFFSET = 50;
export const ZONE_VIEWER_CARD_OVERLAP =
  ZONE_VIEWER_CARD_HEIGHT - ZONE_VIEWER_STACK_OFFSET;
