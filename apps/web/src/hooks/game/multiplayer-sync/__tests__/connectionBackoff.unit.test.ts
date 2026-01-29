import { describe, expect, it } from "vitest";
import {
  DEFAULT_BACKOFF_CONFIG,
  computeBackoffDelay,
  isRoomResetClose,
  shouldAbandonReconnect,
} from "../connectionBackoff";

describe("computeBackoffDelay", () => {
  it("uses full jitter for normal closes", () => {
    const delay = computeBackoffDelay(0, "close", DEFAULT_BACKOFF_CONFIG, () => 0.5);
    expect(delay).toBe(2500);
  });

  it("caps exponential backoff at maxMs", () => {
    const delay = computeBackoffDelay(8, "close", DEFAULT_BACKOFF_CONFIG, () => 0.25);
    expect(delay).toBe(30000);
  });

  it("uses room reset range for room-reset reason", () => {
    const delay = computeBackoffDelay(
      2,
      "room-reset",
      DEFAULT_BACKOFF_CONFIG,
      () => 0
    );
    expect(delay).toBe(DEFAULT_BACKOFF_CONFIG.roomResetMinMs);
  });
});

describe("isRoomResetClose", () => {
  it("detects room reset by reason", () => {
    expect(isRoomResetClose({ reason: "room reset" })).toBe(true);
  });

  it("ignores 1013 without room reset reason", () => {
    expect(isRoomResetClose({ code: 1013, reason: "rate limited" })).toBe(false);
  });

  it("ignores other closes", () => {
    expect(isRoomResetClose({ code: 1006, reason: "abnormal" })).toBe(false);
  });
});

describe("shouldAbandonReconnect", () => {
  it("returns false when under max attempts", () => {
    expect(shouldAbandonReconnect(0)).toBe(false);
    expect(shouldAbandonReconnect(DEFAULT_BACKOFF_CONFIG.maxAttempts - 1)).toBe(false);
  });

  it("returns true when at or over max attempts", () => {
    expect(shouldAbandonReconnect(DEFAULT_BACKOFF_CONFIG.maxAttempts)).toBe(true);
    expect(shouldAbandonReconnect(DEFAULT_BACKOFF_CONFIG.maxAttempts + 10)).toBe(true);
  });
});
