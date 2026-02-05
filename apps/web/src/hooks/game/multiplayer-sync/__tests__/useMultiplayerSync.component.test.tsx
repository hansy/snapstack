import { renderHook, act, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ViewerRole } from "@/types/ids";
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
  viewerRole: "player" as ViewerRole,
  sessionId: null as string | null,
  myPlayerId: null as string | null,
  players: {},
  playerOrder: [],
  zones: {},
  cards: {},
  battlefieldGridSizing: {},
  roomLockedByHost: false,
  roomOverCapacity: false,
  roomTokens: null as any,
  setRoomTokens: vi.fn(),
  setViewerRole: vi.fn((role: "player" | "spectator") => {
    mockGameState.viewerRole = role;
  }),
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
  getIntentConnectionMeta: vi.fn(() => ({
    isOpen: false,
    everConnected: true,
    lastOpenAt: null,
    lastCloseAt: 0,
  })),
}));
const resolveJoinToken = vi.hoisted(() => vi.fn(async () => "test-join-token"));
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
  clearRoomUnavailable: vi.fn(),
  isRoomHostPending: vi.fn(() => true),
  isRoomUnavailable: vi.fn(() => false),
  markRoomUnavailable: vi.fn(),
  mergeRoomTokens: (base: any, update: any) => ({ ...(base ?? {}), ...(update ?? {}) }),
  readRoomTokensFromStorage: vi.fn(() => null),
  resolveInviteTokenFromUrl: vi.fn(() => ({})),
  writeRoomTokensToStorage: vi.fn(),
}));
vi.mock("@/lib/partyKitHost", () => ({ resolvePartyKitHost: () => "party.test" }));
vi.mock("@/partykit/intentTransport", () => intentTransportMocks);
vi.mock("@/lib/joinToken", () => ({ resolveJoinToken }));
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

import {
  clearRoomUnavailable,
  isRoomHostPending,
  isRoomUnavailable,
  markRoomUnavailable,
  readRoomTokensFromStorage,
  resolveInviteTokenFromUrl,
} from "@/lib/partyKitToken";
import { useMultiplayerSync } from "../useMultiplayerSync";

describe("useMultiplayerSync", () => {
  let randomSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    providerInstances.length = 0;
    vi.clearAllMocks();
    randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    logStoreMocks.emitLog.mockClear();
    vi.mocked(resolveJoinToken).mockResolvedValue("test-join-token");
    vi.mocked(readRoomTokensFromStorage).mockReturnValue(null);
    Object.assign(mockGameState, {
      hasHydrated: true,
      viewerRole: "player" as ViewerRole,
      sessionId: null as string | null,
      myPlayerId: null as string | null,
    });
    mockGameState.setViewerRole.mockClear();
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

  it("upgrades spectators to players when a player invite is present", async () => {
    mockGameState.viewerRole = "spectator";
    vi.mocked(resolveInviteTokenFromUrl)
      .mockReturnValueOnce({
        token: "player-token",
        role: "player",
      })
      .mockReturnValueOnce({
        token: "player-token",
        role: "player",
      });

    renderHook(() => useMultiplayerSync("session-upgrade"));

    await waitFor(() => {
      expect(mockGameState.setViewerRole).toHaveBeenCalledWith("player");
      expect(mockGameState.viewerRole).toBe("player");
    });
  });

  it("clears room unavailable when a fresh invite token is present", async () => {
    vi.mocked(isRoomUnavailable).mockReturnValueOnce(true).mockReturnValueOnce(true);
    vi.mocked(isRoomHostPending).mockReturnValueOnce(false);
    vi.mocked(resolveInviteTokenFromUrl)
      .mockReturnValueOnce({
        token: "player-token",
        role: "player",
      })
      .mockReturnValueOnce({
        token: "player-token",
        role: "player",
      });

    renderHook(() => useMultiplayerSync("session-available"));

    await waitFor(() => {
      expect(clearRoomUnavailable).toHaveBeenCalledWith("session-available");
      expect(docManagerMocks.setSessionProvider).toHaveBeenCalledWith(
        "session-available",
        expect.any(Object)
      );
    });
  });

  it("clears room unavailable when host pending is set", async () => {
    vi.mocked(isRoomUnavailable).mockReturnValueOnce(true).mockReturnValueOnce(true);
    vi.mocked(isRoomHostPending).mockReturnValueOnce(true);

    renderHook(() => useMultiplayerSync("session-host"));

    await waitFor(() => {
      expect(clearRoomUnavailable).toHaveBeenCalledWith("session-host");
      expect(docManagerMocks.setSessionProvider).toHaveBeenCalledWith(
        "session-host",
        expect.any(Object)
      );
    });
  });

  it("rechecks invites when the location key changes", async () => {
    vi.mocked(isRoomUnavailable).mockReturnValueOnce(true).mockReturnValueOnce(true);
    vi.mocked(isRoomHostPending).mockReturnValueOnce(false).mockReturnValueOnce(false);
    vi.mocked(resolveInviteTokenFromUrl)
      .mockReturnValueOnce({})
      .mockReturnValueOnce({
        token: "player-token",
        role: "player",
      });

    const { rerender, result } = renderHook(
      ({ locationKey }) => useMultiplayerSync("session-location", locationKey),
      { initialProps: { locationKey: "?stale=1" } }
    );

    await waitFor(() => {
      expect(result.current.joinBlockedReason).toBe("room-unavailable");
    });

    rerender({ locationKey: "?gt=player-token" });

    await waitFor(() => {
      expect(clearRoomUnavailable).toHaveBeenCalledWith("session-location");
    });
  });

  it("treats invalid token as invite-required", async () => {
    const { result } = renderHook(() => useMultiplayerSync("session-invalid"));

    await waitFor(() => {
      expect(intentTransportMocks.createIntentTransport).toHaveBeenCalled();
    });

    const [{ onClose }] = intentTransportMocks.createIntentTransport.mock.calls[0] as any;

    act(() => {
      onClose({ code: 1008, reason: "invalid token" });
    });

    await waitFor(() => {
      expect(markRoomUnavailable).not.toHaveBeenCalled();
      expect(result.current.joinBlocked).toBe(true);
      expect(result.current.joinBlockedReason).toBe("invite");
    });
  });

  it("treats invalid token as room-unavailable when prior tokens exist", async () => {
    vi.mocked(readRoomTokensFromStorage).mockReturnValue({
      playerToken: "stored-player",
      spectatorToken: "stored-spectator",
    });

    const { result } = renderHook(() => useMultiplayerSync("session-expired"));

    await waitFor(() => {
      expect(intentTransportMocks.createIntentTransport).toHaveBeenCalled();
    });

    const [{ onClose }] = intentTransportMocks.createIntentTransport.mock.calls[0] as any;

    act(() => {
      onClose({ code: 1008, reason: "invalid token" });
    });

    await waitFor(() => {
      expect(markRoomUnavailable).toHaveBeenCalledWith("session-expired");
      expect(result.current.joinBlocked).toBe(true);
      expect(result.current.joinBlockedReason).toBe("room-unavailable");
    });
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

  it("does not tear down immediately when the intent socket closes", async () => {
    renderHook(() => useMultiplayerSync("session-909"));

    await waitFor(() => {
      expect(intentTransportMocks.createIntentTransport).toHaveBeenCalledTimes(1);
    });

    const [{ onClose }] = intentTransportMocks.createIntentTransport.mock.calls[0] as any;

    act(() => {
      onClose({ code: 1006, reason: "abnormal" });
    });

    expect(intentTransportMocks.createIntentTransport).toHaveBeenCalledTimes(1);
  });

  it("reconnects if intent stays closed past the grace period", async () => {
    renderHook(() => useMultiplayerSync("session-910"));

    await waitFor(() => {
      expect(intentTransportMocks.createIntentTransport).toHaveBeenCalledTimes(1);
    });

    const [{ onClose }] = intentTransportMocks.createIntentTransport.mock.calls[0] as any;

    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2024-01-01T00:00:00.000Z"));

      act(() => {
        onClose({ code: 1006, reason: "abnormal" });
      });

      await act(async () => {
        vi.advanceTimersByTime(15_000);
      });
      await act(async () => {
        vi.runOnlyPendingTimers();
      });

      expect(intentTransportMocks.createIntentTransport).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("reconnects even when provider stays connected", async () => {
    renderHook(() => useMultiplayerSync("session-911"));

    await waitFor(() => {
      expect(intentTransportMocks.createIntentTransport).toHaveBeenCalledTimes(1);
    });

    const provider = providerInstances[0];
    act(() => {
      provider.emit("status", { status: "connected" });
    });

    const [{ onClose }] = intentTransportMocks.createIntentTransport.mock.calls[0] as any;

    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2024-01-01T00:00:00.000Z"));

      act(() => {
        onClose({ code: 1006, reason: "abnormal" });
      });

      await act(async () => {
        vi.advanceTimersByTime(15_000);
      });
      await act(async () => {
        vi.runOnlyPendingTimers();
      });

      expect(intentTransportMocks.createIntentTransport).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("reconnects even if provider reports connected after intent closes", async () => {
    renderHook(() => useMultiplayerSync("session-912"));

    await waitFor(() => {
      expect(intentTransportMocks.createIntentTransport).toHaveBeenCalledTimes(1);
    });

    const provider = providerInstances[0];
    const [{ onClose }] = intentTransportMocks.createIntentTransport.mock.calls[0] as any;

    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2024-01-01T00:00:00.000Z"));

      act(() => {
        onClose({ code: 1006, reason: "abnormal" });
      });

      await act(async () => {
        vi.advanceTimersByTime(5000);
      });

      act(() => {
        provider.emit("status", { status: "connected" });
      });

      await act(async () => {
        vi.advanceTimersByTime(10_000);
      });
      await act(async () => {
        vi.runOnlyPendingTimers();
      });

      expect(intentTransportMocks.createIntentTransport).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
