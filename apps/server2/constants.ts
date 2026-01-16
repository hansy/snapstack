export const messageSync = 0;
export const messageAwareness = 1;

export const MAX_MESSAGE_BYTES = 512 * 1024; // allow larger initial sync payloads
export const RATE_LIMIT_WINDOW_MS = 5_000;
export const RATE_LIMIT_MAX_MESSAGES = 120;
export const RATE_LIMIT_MAX_BYTES = 2 * 1024 * 1024;
export const DEFAULT_PING_INTERVAL_MS = 30_000;
export const EMPTY_ROOM_GRACE_MS = 60 * 60 * 1000; // 1 hour persistence after all players leave
export const PERSIST_DEBOUNCE_MS = 1_000; // Debounce storage writes

export const STORAGE_KEY_DOC = "yjs:doc";
export const STORAGE_KEY_TIMESTAMP = "yjs:timestamp";

export const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const DEFAULT_DEBUG_SIGNAL = false;

export const resolveDebugSignal = (env?: { DEBUG_SIGNAL?: string }): boolean => {
  const raw =
    env?.DEBUG_SIGNAL ??
    (typeof process !== "undefined" ? process.env?.DEBUG_SIGNAL : undefined);
  if (!raw) return DEFAULT_DEBUG_SIGNAL;

  const normalized = raw.trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
};

export const DEBUG_SIGNAL = DEFAULT_DEBUG_SIGNAL;

