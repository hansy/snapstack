import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearIntentTransport,
  getIntentConnectionMeta,
  setIntentTransport,
} from "../intentTransport";

describe("intentTransport meta", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T00:00:00.000Z"));
  });

  afterEach(() => {
    clearIntentTransport();
    vi.useRealTimers();
  });

  it("syncs meta when transport reports closed without close event", () => {
    let open = true;
    const transport = {
      sendIntent: vi.fn(() => true),
      sendMessage: vi.fn(() => true),
      close: vi.fn(),
      isOpen: () => open,
    };

    setIntentTransport(transport);
    const initial = getIntentConnectionMeta();

    expect(initial.isOpen).toBe(true);
    expect(initial.everConnected).toBe(true);
    expect(initial.lastOpenAt).toBeTypeOf("number");
    expect(initial.lastCloseAt).toBeNull();

    open = false;
    vi.advanceTimersByTime(2000);

    const updated = getIntentConnectionMeta();
    expect(updated.isOpen).toBe(false);
    expect(updated.lastCloseAt).toBeTypeOf("number");
    expect(updated.lastCloseAt).toBeGreaterThanOrEqual(initial.lastOpenAt as number);
  });
});
