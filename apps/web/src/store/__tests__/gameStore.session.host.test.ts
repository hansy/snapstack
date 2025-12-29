import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/yjs/docManager", async () => {
  const actual = await vi.importActual<typeof import("@/yjs/docManager")>(
    "@/yjs/docManager"
  );
  const destroySession = vi.fn((sessionId: string) => {
    const handles = actual.getSessionHandles(sessionId);
    (destroySession as unknown as { lastHostId?: unknown }).lastHostId = handles?.meta.get("hostId");
    return actual.destroySession(sessionId);
  });
  return { ...actual, destroySession };
});

describe("leaveGame host reassignment", () => {
  beforeAll(async () => {
    const { ensureLocalStorage } = await import("@/store/testUtils");
    ensureLocalStorage();
  });

  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it("reassigns host when the host leaves", async () => {
    const docManager = await import("@/yjs/docManager");
    const { useGameStore } = await import("@/store/gameStore");
    const { upsertPlayer } = await import("@/yjs/yMutations");

    const sessionId = "s-host";
    const handles = docManager.acquireSession(sessionId);
    docManager.setActiveSession(sessionId);

    const maps = {
      players: handles.players,
      playerOrder: handles.playerOrder,
      zones: handles.zones,
      cards: handles.cards,
      zoneCardOrders: handles.zoneCardOrders,
      globalCounters: handles.globalCounters,
      battlefieldViewScale: handles.battlefieldViewScale,
      meta: handles.meta,
    };

    upsertPlayer(maps, {
      id: "p1",
      name: "Host",
      life: 40,
      counters: [],
      commanderDamage: {},
      commanderTax: 0,
      deckLoaded: false,
    });
    upsertPlayer(maps, {
      id: "p2",
      name: "Guest",
      life: 40,
      counters: [],
      commanderDamage: {},
      commanderTax: 0,
      deckLoaded: false,
    });

    handles.meta.set("hostId", "p1");

    useGameStore.setState({
      sessionId,
      myPlayerId: "p1",
      playerIdsBySession: { [sessionId]: "p1" },
      sessionVersions: { [sessionId]: 1 },
    });

    useGameStore.getState().leaveGame();

    const destroySession = docManager.destroySession as unknown as {
      lastHostId?: string;
    };
    expect(destroySession.lastHostId).toBe("p2");
  });

  it("updates lock metadata when the host toggles the room lock", async () => {
    const docManager = await import("@/yjs/docManager");
    const { useGameStore } = await import("@/store/gameStore");

    const sessionId = "s-lock";
    const handles = docManager.acquireSession(sessionId);
    docManager.setActiveSession(sessionId);

    handles.meta.set("hostId", "p1");

    useGameStore.setState({
      sessionId,
      myPlayerId: "p1",
      roomHostId: "p1",
      roomLockedByHost: false,
      players: {
        p1: { id: "p1", name: "Host", life: 40, counters: [], commanderDamage: {}, commanderTax: 0 },
      },
    });

    useGameStore.getState().setRoomLockedByHost(true);

    expect(handles.meta.get("locked")).toBe(true);
  });
});
