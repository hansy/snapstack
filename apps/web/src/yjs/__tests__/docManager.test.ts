import { afterEach, describe, expect, it, vi } from "vitest";

describe("docManager", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("runMutation executes immediately when an active session exists", async () => {
    vi.resetModules();
    const docManager = await import("../docManager");

    const sessionId = "s-docmanager-immediate";
    const handles = docManager.acquireSession(sessionId);

    const ran = docManager.runMutation((maps) => {
      maps.globalCounters.set("test", "#fff");
    });

    expect(ran).toBe(true);
    expect(handles.globalCounters.get("test")).toBe("#fff");

    docManager.destroySession(sessionId);
  });

  it("queues mutations when no session is active, then flushes them later", async () => {
    vi.resetModules();
    const docManager = await import("../docManager");

    docManager.setActiveSession(null);

    const queued = docManager.runMutation((maps) => {
      maps.globalCounters.set("queued", "1");
    });
    expect(queued).toBe(false);

    const sessionId = "s-docmanager-flush";
    const handles = docManager.acquireSession(sessionId);
    docManager.setActiveSession(sessionId);

    docManager.flushPendingMutations();
    expect(handles.globalCounters.get("queued")).toBe("1");

    docManager.destroySession(sessionId);
  });

  it("batchMutations groups multiple runMutation calls into one transaction", async () => {
    vi.resetModules();
    const docManager = await import("../docManager");

    const sessionId = "s-docmanager-batch";
    const handles = docManager.acquireSession(sessionId);
    docManager.setActiveSession(sessionId);

    let txCount = 0;
    handles.doc.on("afterTransaction", () => {
      txCount += 1;
    });

    docManager.runMutation((maps) => {
      maps.globalCounters.set("a", "1");
    });
    docManager.runMutation((maps) => {
      maps.globalCounters.set("b", "2");
    });
    expect(txCount).toBe(2);

    docManager.batchMutations(() => {
      docManager.runMutation((maps) => {
        maps.globalCounters.set("c", "3");
      });
      docManager.runMutation((maps) => {
        maps.globalCounters.set("d", "4");
      });
    });

    expect(txCount).toBe(3);
    expect(handles.globalCounters.get("c")).toBe("3");
    expect(handles.globalCounters.get("d")).toBe("4");

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
