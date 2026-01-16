import { afterEach, describe, expect, it, vi } from "vitest";

describe("docManager", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("acquires a session and tracks the active session", async () => {
    vi.resetModules();
    const docManager = await import("../docManager");

    const sessionId = "s-docmanager-active";
    const handles = docManager.acquireSession(sessionId);

    expect(handles.doc).toBeDefined();
    expect(docManager.getActiveSessionId()).toBe(sessionId);
    expect(docManager.getActiveHandles()).toBe(handles);

    docManager.destroySession(sessionId);
  });

  it("replaces session providers cleanly", async () => {
    vi.resetModules();
    const docManager = await import("../docManager");

    const sessionId = "s-docmanager-provider";
    docManager.acquireSession(sessionId);

    const firstProvider = {
      disconnect: vi.fn(),
      destroy: vi.fn(),
    } as any;
    const nextProvider = {
      disconnect: vi.fn(),
      destroy: vi.fn(),
    } as any;

    docManager.setSessionProvider(sessionId, firstProvider);
    docManager.setSessionProvider(sessionId, nextProvider);

    expect(firstProvider.disconnect).toHaveBeenCalled();
    expect(firstProvider.destroy).toHaveBeenCalled();
    expect(docManager.getSessionProvider(sessionId)).toBe(nextProvider);

    docManager.destroySession(sessionId);
  });

  it("cleanupStaleSessions destroys idle sessions with refCount 0", async () => {
    vi.resetModules();
    const docManager = await import("../docManager");

    const nowSpy = vi.spyOn(Date, "now");

    const sessionId = "s-docmanager-stale";
    nowSpy.mockReturnValue(1000);
    docManager.acquireSession(sessionId);
    docManager.releaseSession(sessionId);

    nowSpy.mockReturnValue(11_000);
    docManager.cleanupStaleSessions(0);

    expect(docManager.getSessionHandles(sessionId)).toBeNull();
  });
});
