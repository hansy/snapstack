import { renderHook, act, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Stub doc with only the APIs used inside the hook
class MockDoc {
  listeners = new Map<string, Set<() => void>>();

  on(event: string, handler: () => void) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);
  }

  off(event: string, handler: () => void) {
    this.listeners.get(event)?.delete(handler);
  }

  transact(fn: () => void) {
    fn();
  }
}

const providerInstances: any[] = vi.hoisted(() => []);
const mockGameState = vi.hoisted(() => ({
  hasHydrated: true,
  viewerRole: "player" as const,
  sessionId: null as string | null,
  myPlayerId: null as string | null,
  ensurePlayerIdForSession: vi.fn(() => "player-1"),
  resetSession: vi.fn(),
  ensureSessionVersion: vi.fn(() => 1),
}));
const docManagerMocks = vi.hoisted(() => ({
  acquireSession: vi.fn(() => ({
    doc: new MockDoc(),
    players: new Map(),
    playerOrder: new Map(),
    zones: new Map(),
    cards: new Map(),
    zoneCardOrders: new Map(),
    globalCounters: new Map(),
    battlefieldViewScale: new Map(),
    logs: new Map(),
    meta: new Map(),
  })),
  cleanupStaleSessions: vi.fn(),
  setActiveSession: vi.fn(),
  releaseSession: vi.fn(),
  flushPendingMutations: vi.fn(),
  getSessionProvider: vi.fn(() => null),
  setSessionProvider: vi.fn(),
  getSessionAwareness: vi.fn(() => null),
  setSessionAwareness: vi.fn(),
}));
const ensureLocalPlayerInitialized = vi.hoisted(() => vi.fn(() => null));
const createFullSyncToStore = vi.hoisted(() => vi.fn(() => vi.fn()));
const disposeSessionTransport = vi.hoisted(() => vi.fn());
vi.mock("y-websocket", () => {
  class MockWebsocketProvider {
    callbacks = new Map<string, (payload: any) => void>();
    awareness: any;

    constructor(_url: string, _room: string, _doc: any, opts: any) {
      this.awareness = opts.awareness;
      providerInstances.push(this);
    }

    on(event: string, handler: (payload: any) => void) {
      this.callbacks.set(event, handler);
    }

    emit(event: string, payload: any) {
      this.callbacks.get(event)?.(payload);
    }

    disconnect = vi.fn();
    destroy = vi.fn();
  }

  return { WebsocketProvider: MockWebsocketProvider };
});

// Minimal awareness mock used by the hook
vi.mock("y-protocols/awareness", () => {
  class MockAwareness {
    state: Record<string, unknown> | null = {};
    clientID = 1;
    states = new Map();
    on(_event: string, _handler: () => void) {}
    off(_event: string, _handler: () => void) {}
    getStates() {
      return this.states;
    }
    setLocalState(_state: null) {
      this.state = null;
    }
    setLocalStateField(_key: string, _value: unknown) {}
  }

  return { Awareness: MockAwareness, removeAwarenessStates: vi.fn() };
});

vi.mock("@/store/gameStore", () => {
  const useGameStore = (selector: any) => selector(mockGameState);
  useGameStore.getState = () => mockGameState;
  useGameStore.setState = (updater: any) => {
    const next = typeof updater === "function" ? updater(mockGameState) : updater;
    Object.assign(mockGameState, next);
  };
  return { useGameStore };
});

vi.mock("@/store/clientPrefsStore", () => {
  const prefsState = { username: "test-user" };
  const useClientPrefsStore = (selector?: any) =>
    selector ? selector(prefsState) : prefsState;
  useClientPrefsStore.getState = () => prefsState;
  return { useClientPrefsStore };
});

vi.mock("@/logging/logStore", () => ({ bindSharedLogStore: vi.fn() }));
vi.mock("@/lib/clientKey", () => ({ getOrCreateClientKey: vi.fn(() => "client-key") }));
vi.mock("@/lib/wsSignaling", () => ({ buildSignalingUrlFromEnv: () => "ws://signal.test" }));
vi.mock("@/yjs/sync", () => ({
  isApplyingRemoteUpdate: () => false,
  withApplyingRemoteUpdate: (fn: () => void) => fn(),
  sanitizeSharedSnapshot: (value: any) => value,
}));
vi.mock("@/yjs/docManager", () => docManagerMocks);

vi.mock("../ensureLocalPlayerInitialized", () => ({ ensureLocalPlayerInitialized }));
vi.mock("../peerCount", () => ({ computePeerCounts: () => ({ total: 2, players: 1, spectators: 1 }) }));
vi.mock("../debouncedTimeout", () => ({
  scheduleDebouncedTimeout: (_ref: any, _ms: number, cb: () => void) => cb(),
  cancelDebouncedTimeout: vi.fn(),
}));
vi.mock("../fullSyncToStore", () => ({ createFullSyncToStore }));

vi.mock("../disposeSessionTransport", () => ({ disposeSessionTransport }));

import { useMultiplayerSync } from "../useMultiplayerSync";

describe("useMultiplayerSync", () => {
  beforeEach(() => {
    providerInstances.length = 0;
    vi.clearAllMocks();
    Object.assign(mockGameState, {
      hasHydrated: true,
      viewerRole: "player" as const,
      sessionId: null as string | null,
      myPlayerId: null as string | null,
    });
  });

  it("blocks joining when initialization reports a blocked state", async () => {
    ensureLocalPlayerInitialized.mockReturnValueOnce({
      status: "blocked",
      reason: "room-full",
    });

    const { result } = renderHook(() => useMultiplayerSync("session-123"));

    await waitFor(() => {
      expect(docManagerMocks.setActiveSession).toHaveBeenCalledWith("session-123");
      expect(docManagerMocks.setSessionProvider).toHaveBeenCalledWith(
        "session-123",
        expect.any(Object)
      );
      expect(docManagerMocks.setSessionAwareness).toHaveBeenCalledWith(
        "session-123",
        expect.any(Object)
      );
    });
    expect(providerInstances).toHaveLength(1);

    act(() => {
      providerInstances[0].emit("sync", true);
    });

    await waitFor(() => {
      expect(ensureLocalPlayerInitialized).toHaveBeenCalledWith({
        transact: expect.any(Function),
        sharedMaps: expect.any(Object),
        playerId: "player-1",
        preferredUsername: "test-user",
      });
      expect(result.current.joinBlocked).toBe(true);
      expect(result.current.joinBlockedReason).toBe("room-full");
    });
  });

  it("cleans up transport when unmounted", async () => {
    const { unmount } = renderHook(() => useMultiplayerSync("session-456"));

    await waitFor(() => expect(docManagerMocks.setSessionProvider).toHaveBeenCalled());

    const provider = providerInstances[0];
    const awareness = provider.awareness;

    unmount();

    expect(disposeSessionTransport).toHaveBeenCalledWith(
      "session-456",
      expect.objectContaining({ provider, awareness }),
      expect.objectContaining({
        getSessionProvider: docManagerMocks.getSessionProvider,
        setSessionProvider: docManagerMocks.setSessionProvider,
        getSessionAwareness: docManagerMocks.getSessionAwareness,
        setSessionAwareness: docManagerMocks.setSessionAwareness,
      })
    );
    expect(docManagerMocks.releaseSession).toHaveBeenCalledWith("session-456");
    expect(docManagerMocks.cleanupStaleSessions).toHaveBeenCalled();
    expect(docManagerMocks.setActiveSession).toHaveBeenCalledWith(null);
  });
});
