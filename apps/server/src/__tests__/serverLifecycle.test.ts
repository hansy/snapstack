import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import type * as Party from "partykit/server";

vi.mock("y-partykit", () => ({
  onConnect: vi.fn(),
  unstable_getYDoc: vi.fn(async () => new Y.Doc()),
}));

vi.mock("../domain/intents/applyIntentToDoc", () => ({
  applyIntentToDoc: vi.fn(() => ({ ok: true, hiddenChanged: true, logEvents: [] })),
}));

import MtgPartyServer, { createEmptyHiddenState } from "../server";
import { onConnect } from "y-partykit";

const createDeferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const createParty = () => {
  const store = new Map<string, unknown>();
  const storage = {
    get: vi.fn(async (key: string) => store.get(key)),
    put: vi.fn(async (key: string, value: unknown) => {
      store.set(key, value);
    }),
    delete: vi.fn(async (key: string) => {
      store.delete(key);
    }),
  };
  return { id: "room-test", storage } as unknown as Party.Room;
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
    const party = createParty();
    const server = new MtgPartyServer(party);
    (server as any).hiddenState = createEmptyHiddenState();

    const broadcastGate = createDeferred<void>();
    const broadcastSpy = vi
      .spyOn(server as any, "broadcastOverlays")
      .mockReturnValue(broadcastGate.promise);

    const conn = new TestConnection();
    conn.state = { playerId: "p1", viewerRole: "player" };

    const intent = { id: "intent-1", type: "card.add", payload: { actorId: "p1" } };
    const intentPromise = (server as any).handleIntent(conn, intent);

    for (let i = 0; i < 3 && broadcastSpy.mock.calls.length === 0; i += 1) {
      await Promise.resolve();
    }

    expect(broadcastSpy).toHaveBeenCalledTimes(1);
    (server as any).resetGeneration += 1;
    broadcastGate.resolve();

    await intentPromise;

    expect(party.storage.put).not.toHaveBeenCalled();
  });

  it("does not register sync connections that close before auth resolves", async () => {
    const party = createParty();
    const server = new MtgPartyServer(party);
    const loadDeferred = createDeferred<unknown>();
    vi.spyOn(server as any, "loadRoomTokens").mockReturnValue(loadDeferred.promise);

    const conn = new TestConnection();
    const url = new URL("https://example.test/?playerId=p1");
    const bindPromise = (server as any).bindSyncConnection(conn, url);

    conn.close(1000, "client closed");
    loadDeferred.resolve(null);
    await bindPromise;

    const roles = (server as any).connectionRoles as Map<unknown, unknown>;
    expect(roles.size).toBe(0);
    expect(onConnect).not.toHaveBeenCalled();
  });
});
