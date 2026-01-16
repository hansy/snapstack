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
    const state = createState();
    const server = new Room(state, { rooms: {} as any });
    (server as any).hiddenState = createEmptyHiddenState();

    const broadcastGate = createDeferred<void>();
    const broadcastSpy = vi
      .spyOn(server as any, "broadcastOverlays")
      .mockReturnValue(broadcastGate.promise);

    const conn = new TestConnection();
    conn.state = { playerId: "p1", viewerRole: "player" };

    const intent = {
      id: "intent-1",
      type: "card.add",
      payload: { actorId: "p1" },
    };
    const intentPromise = (server as any).handleIntent(conn, intent);

    for (let i = 0; i < 3 && broadcastSpy.mock.calls.length === 0; i += 1) {
      await Promise.resolve();
    }

    expect(broadcastSpy).toHaveBeenCalledTimes(1);
    (server as any).resetGeneration += 1;
    broadcastGate.resolve();

    await intentPromise;

    expect(state.storage.put).not.toHaveBeenCalled();
  });

  it("does not register sync connections that close before auth resolves", async () => {
    const state = createState();
    const server = new Room(state, { rooms: {} as any });
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
      const server = new Room(state, { rooms: {} as any });
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
