import { afterEach, describe, expect, it, vi } from "vitest";

import { DEBUG_SIGNAL, resolveDebugSignal } from "./constants";

describe("DEBUG_SIGNAL flag", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults to disabled", () => {
    expect(DEBUG_SIGNAL).toBe(false);
  });

  it("respects the DEBUG_SIGNAL env toggle", () => {
    vi.stubEnv("DEBUG_SIGNAL", "true");
    expect(resolveDebugSignal({ DEBUG_SIGNAL: process.env.DEBUG_SIGNAL })).toBe(
      true
    );

    vi.stubEnv("DEBUG_SIGNAL", "false");
    expect(resolveDebugSignal({ DEBUG_SIGNAL: process.env.DEBUG_SIGNAL })).toBe(
      false
    );
  });
});
