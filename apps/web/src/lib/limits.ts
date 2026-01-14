// These limits must stay in sync with Yjs snapshot sanitization to avoid
// "phantom cards" (e.g. importing more than the client will retain).
export const MAX_CARDS = 800;
export const MAX_CARDS_PER_ZONE = 300;
export const MAX_REVEALED_TO = 8;
export const MIN_PLAYER_LIFE = -999;
export const MAX_PLAYER_LIFE = 999;
