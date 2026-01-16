import type { ZoneType } from "../../../web/src/types/zones";

export const LEGACY_BATTLEFIELD_WIDTH = 1000;
export const LEGACY_BATTLEFIELD_HEIGHT = 600;
export const SNAP_GRID_SIZE = 30;
export const GRID_STEP_X = SNAP_GRID_SIZE / LEGACY_BATTLEFIELD_WIDTH;
export const GRID_STEP_Y = SNAP_GRID_SIZE / LEGACY_BATTLEFIELD_HEIGHT;
export const MAX_REVEALED_TO = 8;

export const ZONE = {
  LIBRARY: "library",
  HAND: "hand",
  BATTLEFIELD: "battlefield",
  GRAVEYARD: "graveyard",
  EXILE: "exile",
  COMMANDER: "commander",
  SIDEBOARD: "sideboard",
} as const satisfies Record<string, ZoneType>;

export const LEGACY_COMMAND_ZONE = "command" as const;

export const HIDDEN_STATE_KEY = "hiddenState";
export const HIDDEN_STATE_META_KEY = "hiddenState:v2:meta";
export const HIDDEN_STATE_CARDS_PREFIX = "hiddenState:v2:cards:";
export const ROOM_TOKENS_KEY = "roomTokens";
export const MAX_HIDDEN_STATE_CHUNK_SIZE = 120_000;

export const isHiddenZoneType = (zoneType: ZoneType | undefined) =>
  zoneType === ZONE.HAND || zoneType === ZONE.LIBRARY || zoneType === ZONE.SIDEBOARD;

export const isPublicZoneType = (zoneType: ZoneType | undefined) =>
  Boolean(zoneType) && !isHiddenZoneType(zoneType);
