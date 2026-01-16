// Shared sanitization limits for the multiplayer Yjs document.
//
// These are intentionally conservative to keep Yjs updates bounded even if UI
// accidentally passes large blobs.

import { MAX_PLAYERS } from "@/lib/room";

export { MAX_PLAYERS };
export const MAX_ZONES = MAX_PLAYERS * 10; // 40 zones

export const MAX_COUNTERS = 24;
export const MAX_COUNTER_TYPE_LENGTH = 64;
export const MAX_COUNTER_COLOR_LENGTH = 32;

export const MAX_NAME_LENGTH = 120;
export const MAX_PLAYER_NAME_LENGTH = MAX_NAME_LENGTH;
export const MAX_PLAYER_COLOR_LENGTH = 16;

export const MAX_TYPE_LINE_LENGTH = 240;
export const MAX_ORACLE_TEXT_LENGTH = 2_000;
export const MAX_IMAGE_URL_LENGTH = 1_024;
export const MAX_SCRYFALL_ID_LENGTH = 64;
export const MAX_CUSTOM_TEXT_LENGTH = 280;
export const MAX_REVEAL_ORDER_KEY_LENGTH = 64;
