import { beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

const superOnConnect = vi.fn();

vi.mock("cloudflare:workers", () => ({
  DurableObject: class {
    ctx: any;
    storage: any;
    constructor(ctx: any, _env: any) {
      this.ctx = ctx;
      this.storage = ctx.storage;
    }
  },
  DurableObjectNamespace: class {},
}));

vi.mock("partyserver", () => ({
  routePartykitRequest: vi.fn(async () => null),
}));

vi.mock("y-partyserver", () => ({
  YServer: class {
    ctx: any;
    env: any;
    name: string;
    document: Y.Doc;
    constructor(ctx: any, env: any) {
      this.ctx = ctx;
      this.env = env;
      this.name = ctx?.id?.name ?? "room-test";
      this.document = new Y.Doc();
    }
    onConnect(...args: any[]) {
      return superOnConnect(...args);
    }
  },
}));

vi.mock("../domain/intents/applyIntentToDoc", () => ({
  applyIntentToDoc: vi.fn(() => ({
    ok: true,
    hiddenChanged: true,
    logEvents: [],
  })),
}));

import { Room, createEmptyHiddenState } from "../server";

beforeEach(() => {
  superOnConnect.mockClear();
});

const LIBRARY_VIEW_PING_TIMEOUT_MS = 45_000;
const HIDDEN_STATE_PERSIST_IDLE_MS = 5_000;
const INTENT_LOG_META_KEY = "intent-log:meta";
const INTENT_LOG_PREFIX = "intent-log:";

const createDeferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const createState = () => {
  const store = new Map<string, unknown>();
  const storage = {
    get: vi.fn(async (key: string) => store.get(key)),
    put: vi.fn(async (key: string, value: unknown) => {
      store.set(key, value);
    }),
    delete: vi.fn(async (key: string) => {
      store.delete(key);
    }),
    list: vi.fn(async () => store.entries()),
  };
  return {
    id: { name: "room-test" },
    storage,
  } as any;
};

const createEnv = () => ({
  rooms: {} as any,
  JOIN_TOKEN_SECRET: "test-secret",
});

class TestConnection {
  id = "conn-1";
  uri = "wss://example.test";
  state: unknown;
  private listeners = new Map<string, Set<(event: any) => void>>();

  addEventListener(event: string, handler: (event: any) => void) {
    const set = this.listeners.get(event) ?? new Set();
    set.add(handler);
    this.listeners.set(event, set);
  }

  close(code?: number, reason?: string) {
    const handlers = this.listeners.get("close");
    if (!handlers) return;
    handlers.forEach((handler) => handler({ code, reason }));
  }

  send(_payload: string) {}

  setState(nextState: unknown) {
    this.state = nextState;
  }
}

describe("server lifecycle guards", () => {
  it("skips hidden-state persistence when a reset happens mid-intent", async () => {
    vi.useFakeTimers();
    try {
      const state = createState();
      const server = new Room(state, createEnv());
      (server as any).hiddenState = createEmptyHiddenState();

      const broadcastGate = createDeferred<void>();
      vi.spyOn(server as any, "broadcastOverlays").mockReturnValue(
        broadcastGate.promise
      );

      const conn = new TestConnection();
      conn.state = { playerId: "p1", viewerRole: "player" };

      const intent = {
        id: "intent-1",
        type: "card.add",
        payload: { actorId: "p1" },
      };
      const intentPromise = (server as any).handleIntent(conn, intent);

      await Promise.resolve();
      (server as any).resetGeneration += 1;
      broadcastGate.resolve();

      await intentPromise;
      await vi.runAllTimersAsync();

      const putKeys = state.storage.put.mock.calls.map(
        (call: [string, unknown]) => call[0]
      );
      const snapshotWrites = putKeys.filter(
        (key: string) =>
          key === "snapshot:meta" ||
          key === "yjs:doc" ||
          (typeof key === "string" && key.startsWith("snapshot:hidden:"))
      );
      expect(snapshotWrites).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("skips snapshot meta write if reset happens mid-persist", async () => {
    const store = new Map<string, unknown>();
    const snapshotGate = createDeferred<void>();
    const storage = {
      get: vi.fn(async (key: string) => {
        return store.get(key);
      }),
      put: vi.fn(async (key: string, value: unknown) => {
        if (key === "snapshot:meta") {
          await snapshotGate.promise;
        }
        store.set(key, value);
      }),
      delete: vi.fn(async (key: string) => {
        store.delete(key);
      }),
      list: vi.fn(async () => store.entries()),
    };
    const state = {
      id: { name: "room-test" },
      storage,
    } as any;
    const server = new Room(state, createEnv());
    (server as any).hiddenState = createEmptyHiddenState();

    const expectedResetGeneration = (server as any).resetGeneration;
    const persistPromise = (server as any).persistHiddenState(
      expectedResetGeneration
    );

    for (let i = 0; i < 3 && storage.put.mock.calls.length === 0; i += 1) {
      await Promise.resolve();
    }
    expect(storage.put).toHaveBeenCalled();

    (server as any).resetGeneration += 1;
    snapshotGate.resolve();

    await persistPromise;

    expect(store.has("snapshot:meta")).toBe(false);
  });

  it("debounces hidden-state persistence across rapid intents", async () => {
    vi.useFakeTimers();
    try {
      const state = createState();
      const server = new Room(state, createEnv());
      (server as any).hiddenState = createEmptyHiddenState();
      vi
        .spyOn(server as any, "broadcastOverlays")
        .mockResolvedValue(undefined);
      const persistSpy = vi
        .spyOn(server as any, "persistHiddenState")
        .mockResolvedValue(undefined);

      const conn = new TestConnection();
      conn.state = { playerId: "p1", viewerRole: "player" };

      const intent = {
        id: "intent-1",
        type: "card.add",
        payload: { actorId: "p1" },
      };
      const intentTwo = {
        id: "intent-2",
        type: "card.add",
        payload: { actorId: "p1" },
      };

      await Promise.all([
        (server as any).handleIntent(conn, intent),
        (server as any).handleIntent(conn, intentTwo),
      ]);

      expect(persistSpy).not.toHaveBeenCalled();

      await vi.runAllTimersAsync();

      expect(persistSpy).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("flushes hidden-state persistence after idle timeout", async () => {
    vi.useFakeTimers();
    try {
      const state = createState();
      const server = new Room(state, createEnv());
      (server as any).hiddenState = createEmptyHiddenState();
      vi
        .spyOn(server as any, "broadcastOverlays")
        .mockResolvedValue(undefined);
      const persistSpy = vi
        .spyOn(server as any, "persistHiddenState")
        .mockResolvedValue(undefined);

      const conn = new TestConnection();
      conn.state = { playerId: "p1", viewerRole: "player" };

      const intent = {
        id: "intent-1",
        type: "card.add",
        payload: { actorId: "p1" },
      };

      await (server as any).handleIntent(conn, intent);

      const debounceTimer = (server as any).hiddenStatePersistTimer;
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        (server as any).hiddenStatePersistTimer = null;
      }

      await vi.advanceTimersByTimeAsync(HIDDEN_STATE_PERSIST_IDLE_MS + 50);

      expect(persistSpy).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("falls back to snapshot when diff payload is too large", () => {
    const state = createState();
    const server = new Room(state, createEnv());

    const conn = new TestConnection();
    conn.state = { playerId: "p1", viewerRole: "player" };
    const sent: string[] = [];
    conn.send = (payload: string) => {
      sent.push(payload);
    };

    const overlayService = (server as any).overlayService;
    overlayService.overlayStates.set(conn.id, {
      overlayVersion: 1,
      cardHashes: new Map([["c1", "old"]]),
      zoneOrderHashes: new Map(),
      meta: { cardCount: 1, cardsWithArt: 0, viewerHandCount: 0 },
    });

    const bigName = "x".repeat(70_000);
    const card = {
      id: "c1",
      name: bigName,
      ownerId: "p1",
      controllerId: "p1",
      zoneId: "hand",
      tapped: false,
      faceDown: false,
      position: { x: 0.5, y: 0.5 },
      rotation: 0,
      counters: [],
    };

    const buildResult = {
      overlay: { cards: [card] },
      cardHashes: new Map([["c1", "new"]]),
      zoneOrderHashes: new Map(),
      meta: { cardCount: 1, cardsWithArt: 0, viewerHandCount: 0 },
    };

    overlayService.sendOverlayForConnection({
      conn,
      buildResult,
      viewerId: "p1",
      supportsDiff: true,
    });

    expect(sent).toHaveLength(1);
    const message = JSON.parse(sent[0]);
    expect(message.type).toBe("privateOverlay");
    expect(overlayService.getMetrics().resyncCount).toBe(1);
  });

  it("expires library views after missed pings", async () => {
    vi.useFakeTimers();
    try {
      const state = createState();
      const server = new Room(state, createEnv());
      const conn = new TestConnection();
      conn.state = { playerId: "p1", viewerRole: "player" };
      (server as any).intentConnections.add(conn);

      const overlaySpy = vi
        .spyOn(server as any, "sendOverlayForConnection")
        .mockResolvedValue(undefined);

      vi.setSystemTime(0);
      await (server as any).handleLibraryViewIntent(conn, {
        type: "library.view",
        payload: { playerId: "p1", count: 3 },
      });

      expect((server as any).libraryViews.size).toBe(1);

      vi.advanceTimersByTime(30_000);
      (server as any).handleLibraryViewPingIntent(conn, {
        type: "library.view.ping",
        payload: { playerId: "p1" },
      });

      vi.advanceTimersByTime(LIBRARY_VIEW_PING_TIMEOUT_MS - 1_000);
      (server as any).cleanupExpiredLibraryViews();
      expect((server as any).libraryViews.size).toBe(1);

      vi.advanceTimersByTime(2_000);
      (server as any).cleanupExpiredLibraryViews();
      expect((server as any).libraryViews.size).toBe(0);
      expect(overlaySpy).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("replays intent log entries on load", async () => {
    const store = new Map<string, unknown>();
    const storage = {
      get: vi.fn(async (key: string) => store.get(key)),
      put: vi.fn(async (key: string, value: unknown) => {
        store.set(key, value);
      }),
      delete: vi.fn(async (key: string) => {
        store.delete(key);
      }),
      list: vi.fn(async () => store.entries()),
    };
    const { applyIntentToDoc } = await import("../domain/intents/applyIntentToDoc");
    const applyMock = vi.mocked(applyIntentToDoc);
    applyMock.mockClear();
    const state = {
      id: { name: "room-test" },
      storage,
    } as any;

    store.set(INTENT_LOG_META_KEY, {
      nextIndex: 1,
      logStartIndex: 0,
      snapshotIndex: -1,
      lastSnapshotAt: 0,
    });
    store.set(`${INTENT_LOG_PREFIX}0`, {
      index: 0,
      ts: 0,
      intent: {
        id: "intent-1",
        type: "player.join",
        payload: {
          actorId: "p1",
          player: {
            id: "p1",
            name: "P1",
            life: 20,
            counters: [],
            commanderDamage: {},
            commanderTax: 0,
          },
        },
      },
    });

    const server = new Room(state, createEnv());
    await (server as any).onLoad();

    expect(applyMock).toHaveBeenCalledTimes(1);
    expect(applyMock.mock.calls[0]?.[1]?.type).toBe("player.join");
    const hidden = (server as any).hiddenState;
    expect(hidden).toBeTruthy();
  });

  it("does not register sync connections that close before auth resolves", async () => {
    const state = createState();
    const server = new Room(state, createEnv());
    const loadDeferred = createDeferred<unknown>();
    vi.spyOn(server as any, "loadRoomTokens").mockReturnValue(
      loadDeferred.promise
    );

    const conn = new TestConnection();
    const url = new URL("https://example.test/?playerId=p1");
    const bindPromise = (server as any).bindSyncConnection(conn, url, {
      request: new Request(url.toString()),
    });

    conn.close(1000, "client closed");
    loadDeferred.resolve(null);
    await bindPromise;

    const roles = (server as any).connectionRoles as Map<unknown, unknown>;
    expect(roles.size).toBe(0);
    expect(superOnConnect).not.toHaveBeenCalled();
  });

  it("keeps the room alive while player auth is pending", async () => {
    vi.useFakeTimers();
    try {
      const state = createState();
      const server = new Room(state, createEnv());
      const loadDeferred = createDeferred<unknown>();
      vi.spyOn(server as any, "loadRoomTokens").mockReturnValue(
        loadDeferred.promise
      );

      (server as any).scheduleEmptyRoomTeardown();

      const conn = new TestConnection();
      const url = new URL(
        "https://example.test/?gt=player-token&playerId=p1"
      );
      const bindPromise = (server as any).bindSyncConnection(conn, url, {
        request: new Request(url.toString()),
      });

      vi.advanceTimersByTime(30_000);
      expect((server as any).resetGeneration).toBe(0);

      loadDeferred.resolve({
        playerToken: "player-token",
        spectatorToken: "spectator-token",
      });
      await bindPromise;
      expect(superOnConnect).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
