import {
  BASE_CARD_HEIGHT,
  CARD_ASPECT_RATIO,
  GRID_STEP_X,
  GRID_STEP_Y,
  LEGACY_BATTLEFIELD_HEIGHT,
  LEGACY_BATTLEFIELD_WIDTH,
} from "@mtg/shared/constants/geometry";
import {
  LEGACY_COMMAND_ZONE,
  ZONE,
  isCommanderZoneType,
  isHiddenZoneType,
  isPublicZoneType,
} from "@mtg/shared/constants/zones";

export {
  BASE_CARD_HEIGHT,
  CARD_ASPECT_RATIO,
  GRID_STEP_X,
  GRID_STEP_Y,
  LEGACY_BATTLEFIELD_HEIGHT,
  LEGACY_BATTLEFIELD_WIDTH,
  LEGACY_COMMAND_ZONE,
  ZONE,
  isCommanderZoneType,
  isHiddenZoneType,
  isPublicZoneType,
};
export const MAX_REVEALED_TO = 8;

export const HIDDEN_STATE_KEY = "hiddenState";
export const HIDDEN_STATE_META_KEY = "hiddenState:v2:meta";
export const HIDDEN_STATE_CARDS_PREFIX = "hiddenState:v2:cards:";
export const ROOM_TOKENS_KEY = "roomTokens";
export const MAX_HIDDEN_STATE_CHUNK_SIZE = 120_000;
