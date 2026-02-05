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
export const CARD_HEIGHT_CLASS =
  "h-[120px] lg:h-[var(--card-h,120px)] lg:w-[var(--card-w,80px)] lg:aspect-auto";
export const CARD_ASPECT_CLASS = "aspect-[2/3]";
export const CARD_BASE_CLASS =
  "h-[120px] aspect-[2/3] lg:h-[var(--card-h,120px)] lg:w-[var(--card-w,80px)]";
export const ZONE_BASE_CLASSES = CARD_BASE_CLASS;
export const ZONE_SIDEWAYS_CLASSES =
  "w-full aspect-[var(--sidezone-aspect)]";

// Layout baselines
export const BOARD_BASE_WIDTH = LEGACY_BATTLEFIELD_WIDTH;
export const BOARD_BASE_HEIGHT = LEGACY_BATTLEFIELD_HEIGHT;
