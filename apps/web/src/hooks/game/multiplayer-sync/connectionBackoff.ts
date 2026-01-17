export type BackoffReason = "close" | "room-reset" | "resume";

export type BackoffConfig = {
  baseMs: number;
  maxMs: number;
  roomResetMinMs: number;
  roomResetMaxMs: number;
  stableResetMs: number;
};

export const DEFAULT_BACKOFF_CONFIG: BackoffConfig = {
  baseMs: 1000,
  maxMs: 30000,
  roomResetMinMs: 5000,
  roomResetMaxMs: 15000,
  stableResetMs: 10000,
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
  const clampedAttempt = Math.max(0, attempt);
  const maxDelay = Math.min(config.maxMs, config.baseMs * 2 ** clampedAttempt);
  return Math.floor(random() * maxDelay);
};

export const isRoomResetClose = (
  event?: { code?: number; reason?: string } | null
) => {
  if (!event) return false;
  if (event.code === 1013) return true;
  const reason = (event.reason ?? "").trim().replace(/\.$/, "").toLowerCase();
  return reason === "room reset";
};
