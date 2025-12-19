import { describe, expect, it, vi } from "vitest";

import { cancelDebouncedTimeout, scheduleDebouncedTimeout } from "../debouncedTimeout";

describe("debouncedTimeout", () => {
  it("debounces calls and only fires once", () => {
    vi.useFakeTimers();

    const ref = { current: null as ReturnType<typeof setTimeout> | null };
    const fn = vi.fn();

    scheduleDebouncedTimeout(ref, 50, fn);
    scheduleDebouncedTimeout(ref, 50, fn);
    scheduleDebouncedTimeout(ref, 50, fn);

    expect(fn).toHaveBeenCalledTimes(0);
    vi.advanceTimersByTime(49);
    expect(fn).toHaveBeenCalledTimes(0);
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it("can cancel a scheduled callback", () => {
    vi.useFakeTimers();

    const ref = { current: null as ReturnType<typeof setTimeout> | null };
    const fn = vi.fn();

    scheduleDebouncedTimeout(ref, 50, fn);
    cancelDebouncedTimeout(ref);

    vi.runAllTimers();
    expect(fn).toHaveBeenCalledTimes(0);

    vi.useRealTimers();
  });
});

