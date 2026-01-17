import { describe, expect, it } from "vitest";
import {
  DEFAULT_BACKOFF_CONFIG,
  computeBackoffDelay,
  isRoomResetClose,
} from "../connectionBackoff";

describe("computeBackoffDelay", () => {
  it("uses full jitter for normal closes", () => {
    const delay = computeBackoffDelay(0, "close", DEFAULT_BACKOFF_CONFIG, () => 0.5);
    expect(delay).toBe(500);
  });

  it("caps exponential backoff at maxMs", () => {
    const delay = computeBackoffDelay(8, "close", DEFAULT_BACKOFF_CONFIG, () => 0.25);
    expect(delay).toBe(7500);
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
  it("detects room reset by code", () => {
    expect(isRoomResetClose({ code: 1013 })).toBe(true);
  });

  it("detects room reset by reason", () => {
    expect(isRoomResetClose({ reason: "room reset" })).toBe(true);
  });

  it("ignores other closes", () => {
    expect(isRoomResetClose({ code: 1006, reason: "abnormal" })).toBe(false);
  });
});
