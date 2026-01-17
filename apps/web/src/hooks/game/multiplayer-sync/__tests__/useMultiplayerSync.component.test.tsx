import { renderHook, act, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LocalPlayerInitResult } from "../ensureLocalPlayerInitialized";

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
  players: {},
  playerOrder: [],
  zones: {},
  cards: {},
  roomLockedByHost: false,
  roomOverCapacity: false,
  roomTokens: null as any,
  setRoomTokens: vi.fn(),
  ensurePlayerIdForSession: vi.fn(() => "player-1"),
  resetSession: vi.fn(),
  ensureSessionVersion: vi.fn(() => 1),
  addPlayer: vi.fn(),
  updatePlayer: vi.fn(),
  addZone: vi.fn(),
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
    meta: new Map(),
    handRevealsToAll: new Map(),
    libraryRevealsToAll: new Map(),
    faceDownRevealsToAll: new Map(),
  })),
  cleanupStaleSessions: vi.fn(),
  setActiveSession: vi.fn(),
  releaseSession: vi.fn(),
  getSessionProvider: vi.fn(() => null),
  setSessionProvider: vi.fn(),
  getSessionAwareness: vi.fn(() => null),
  setSessionAwareness: vi.fn(),
}));
const ensureLocalPlayerInitialized = vi.hoisted(() =>
  vi.fn<(...args: any[]) => LocalPlayerInitResult>(() => null)
);
const createFullSyncToStore = vi.hoisted(() => vi.fn(() => vi.fn()));
const disposeSessionTransport = vi.hoisted(() => vi.fn());
const intentTransportMocks = vi.hoisted(() => ({
  createIntentTransport: vi.fn(() => ({ sendIntent: vi.fn(), close: vi.fn() })),
  setIntentTransport: vi.fn(),
  clearIntentTransport: vi.fn(),
}));
const logStoreMocks = vi.hoisted(() => ({ emitLog: vi.fn(), clearLogs: vi.fn() }));
vi.mock("y-partyserver/provider", () => {
  class MockPartyKitProvider {
    callbacks = new Map<string, (payload: any) => void>();
    awareness: any;

    constructor(_host: string, _room: string, _doc: any, opts: any) {
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

  return { default: MockPartyKitProvider };
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
  const prefsState = {
    username: "test-user",
    lastSessionId: null as string | null,
    setLastSessionId: vi.fn((next: string | null) => {
      prefsState.lastSessionId = next;
    }),
    clearLastSessionId: vi.fn(() => {
      prefsState.lastSessionId = null;
    }),
  };
  const useClientPrefsStore = (selector?: any) =>
    selector ? selector(prefsState) : prefsState;
  useClientPrefsStore.getState = () => prefsState;
  return { useClientPrefsStore };
});

vi.mock("@/logging/logStore", () => logStoreMocks);
vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));
vi.mock("@/lib/partyKitToken", () => ({
  clearInviteTokenFromUrl: vi.fn(),
  clearRoomHostPending: vi.fn(),
  isRoomHostPending: vi.fn(() => true),
  mergeRoomTokens: (base: any, update: any) => ({ ...(base ?? {}), ...(update ?? {}) }),
  readRoomTokensFromStorage: vi.fn(() => null),
  resolveInviteTokenFromUrl: vi.fn(() => ({})),
  writeRoomTokensToStorage: vi.fn(),
}));
vi.mock("@/lib/partyKitHost", () => ({ resolvePartyKitHost: () => "party.test" }));
vi.mock("@/partykit/intentTransport", () => intentTransportMocks);
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
  let randomSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    providerInstances.length = 0;
    vi.clearAllMocks();
    randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    logStoreMocks.emitLog.mockClear();
    Object.assign(mockGameState, {
      hasHydrated: true,
      viewerRole: "player" as const,
      sessionId: null as string | null,
      myPlayerId: null as string | null,
    });
  });

  afterEach(() => {
    randomSpy.mockRestore();
  });

  it("blocks joining when initialization reports a blocked state", async () => {
    ensureLocalPlayerInitialized.mockReturnValueOnce({
      status: "blocked",
      reason: "full",
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
        state: expect.objectContaining({
          players: expect.any(Object),
          playerOrder: expect.any(Array),
          zones: expect.any(Object),
          roomLockedByHost: expect.any(Boolean),
          roomOverCapacity: expect.any(Boolean),
        }),
        actions: expect.objectContaining({
          addPlayer: expect.any(Function),
          updatePlayer: expect.any(Function),
          addZone: expect.any(Function),
        }),
        playerId: "player-1",
        preferredUsername: "test-user",
      });
      expect(result.current.joinBlocked).toBe(true);
      expect(result.current.joinBlockedReason).toBe("full");
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

  it("forwards logEvent messages to the log store", async () => {
    renderHook(() => useMultiplayerSync("session-789"));

    await waitFor(() => {
      expect(intentTransportMocks.createIntentTransport).toHaveBeenCalled();
    });

    const [{ onMessage }] = intentTransportMocks.createIntentTransport.mock.calls[0] as any;
    onMessage({
      type: "logEvent",
      eventId: "library.shuffle",
      payload: { actorId: "player-1", playerId: "player-1" },
    });

    expect(logStoreMocks.emitLog).toHaveBeenCalledWith(
      "library.shuffle",
      { actorId: "player-1", playerId: "player-1" },
      expect.objectContaining({
        players: expect.any(Object),
        cards: expect.any(Object),
        zones: expect.any(Object),
      })
    );
  });

  it("reconnects when the intent socket closes", async () => {
    renderHook(() => useMultiplayerSync("session-909"));

    await waitFor(() => {
      expect(intentTransportMocks.createIntentTransport).toHaveBeenCalledTimes(1);
    });

    const [{ onClose }] = intentTransportMocks.createIntentTransport.mock.calls[0] as any;

    act(() => {
      onClose({ code: 1006, reason: "abnormal" });
    });

    await waitFor(() => {
      expect(intentTransportMocks.createIntentTransport).toHaveBeenCalledTimes(2);
    });
  });
});
