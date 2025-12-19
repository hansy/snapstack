import { describe, expect, it, vi } from "vitest";

import { disposeSessionTransport } from "../disposeSessionTransport";

describe("disposeSessionTransport", () => {
  it("clears the provider via setSessionProvider when it is still current", () => {
    const provider = { disconnect: vi.fn(), destroy: vi.fn() } as any;
    const awareness = {} as any;
    const setSessionProvider = vi.fn();

    disposeSessionTransport(
      "s1",
      { provider, awareness },
      {
        getSessionProvider: () => provider,
        setSessionProvider,
        getSessionAwareness: () => awareness,
        setSessionAwareness: vi.fn(),
      }
    );

    expect(setSessionProvider).toHaveBeenCalledWith("s1", null);
    expect(provider.disconnect).not.toHaveBeenCalled();
    expect(provider.destroy).not.toHaveBeenCalled();
  });

  it("disconnects/destroys the provider when a newer one is current", () => {
    const provider = { disconnect: vi.fn(), destroy: vi.fn() } as any;
    const awareness = {} as any;
    const setSessionProvider = vi.fn();

    disposeSessionTransport(
      "s1",
      { provider, awareness },
      {
        getSessionProvider: () => ({}) as any,
        setSessionProvider,
        getSessionAwareness: () => awareness,
        setSessionAwareness: vi.fn(),
      }
    );

    expect(setSessionProvider).not.toHaveBeenCalled();
    expect(provider.disconnect).toHaveBeenCalledTimes(1);
    expect(provider.destroy).toHaveBeenCalledTimes(1);
  });

  it("clears the awareness via setSessionAwareness when it is still current", () => {
    const provider = { disconnect: vi.fn(), destroy: vi.fn() } as any;
    const awareness = {} as any;
    const setSessionAwareness = vi.fn();

    disposeSessionTransport(
      "s1",
      { provider, awareness },
      {
        getSessionProvider: () => provider,
        setSessionProvider: vi.fn(),
        getSessionAwareness: () => awareness,
        setSessionAwareness,
      }
    );

    expect(setSessionAwareness).toHaveBeenCalledWith("s1", null);
  });
});

