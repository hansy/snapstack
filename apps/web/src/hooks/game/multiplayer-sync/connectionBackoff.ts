export type BackoffReason =
  | "close"
  | "room-reset"
  | "resume"
  | "rate-limit"
  | "join-token";

export type BackoffConfig = {
  baseMs: number;
  maxMs: number;
  maxAttempts: number;
  roomResetMinMs: number;
  roomResetMaxMs: number;
  stableResetMs: number;
  rateLimitMs: number;
};

export const DEFAULT_BACKOFF_CONFIG: BackoffConfig = {
  baseMs: 5000,
  maxMs: 120000,
  maxAttempts: 6, // Stop trying after 6 failed attempts (default backoff ~5 min)
  roomResetMinMs: 15000,
  roomResetMaxMs: 45000,
  stableResetMs: 60000,
  rateLimitMs: 120000,
};

/**
 * Check if reconnection should be abandoned after too many attempts.
 */
export const shouldAbandonReconnect = (
  attempt: number,
  config: BackoffConfig = DEFAULT_BACKOFF_CONFIG
): boolean => {
  return attempt >= config.maxAttempts;
};

export const computeBackoffDelay = (
  attempt: number,
  reason: BackoffReason,
  config: BackoffConfig = DEFAULT_BACKOFF_CONFIG,
  random: () => number = Math.random
) => {
  if (reason === "room-reset") {
    const span = Math.max(0, config.roomResetMaxMs - config.roomResetMinMs);
    return config.roomResetMinMs + Math.floor(random() * span);
  }
  if (reason === "rate-limit") {
    return config.rateLimitMs;
  }
  const clampedAttempt = Math.max(0, attempt);
  const maxDelay = Math.min(config.maxMs, config.baseMs * 2 ** clampedAttempt);
  return Math.floor(random() * maxDelay);
};

const normalizeCloseReason = (reason?: string | null) =>
  (reason ?? "").trim().replace(/\.$/, "").toLowerCase();

export const isRoomResetClose = (
  event?: { code?: number; reason?: string } | null
) => {
  if (!event) return false;
  return normalizeCloseReason(event.reason) === "room reset";
};

export const isRateLimitedClose = (
  event?: { code?: number; reason?: string } | null
) => {
  if (!event) return false;
  const reason = normalizeCloseReason(event.reason);
  if (reason === "room reset") return false;
  if (event.code === 1013) return true;
  return reason.includes("rate limit");
};
