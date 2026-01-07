import { renderHook, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildSessionLink } from "@/lib/sessionKeys";

const mockGameState = vi.hoisted(() => ({
  zones: {},
  cards: {},
  players: {},
  playerOrder: [],
  battlefieldViewScale: {},
  viewerRole: "player" as const,
  setViewerRole: vi.fn(),
  roomHostId: "player-1",
  roomLockedByHost: false,
  roomOverCapacity: false,
  setRoomLockedByHost: vi.fn(),
  activeModal: null,
  setActiveModal: vi.fn(),
  updatePlayer: vi.fn(),
  drawCard: vi.fn(),
  leaveGame: vi.fn(),
}));

const mockDragState = vi.hoisted(() => ({
  overCardScale: 1,
  activeCardId: null as string | null,
  isGroupDragging: false,
  ghostCards: [],
}));

const mockSelectionState = vi.hoisted(() => ({
  selectedCardIds: [] as string[],
  selectionZoneId: null as string | null,
}));

const mockPrefsState = vi.hoisted(() => ({
  username: "Tester",
  setUsername: vi.fn(),
}));

const sessionKeysMocks = vi.hoisted(() => ({
  ensureSessionAccessKeys: vi.fn(() => ({
    playerKey: "player-key",
    spectatorKey: "spectator-key",
  })),
}));

const clipboardMocks = vi.hoisted(() => ({
  writeText: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/lib/sessionKeys", async () => {
  const actual = await vi.importActual<typeof import("@/lib/sessionKeys")>(
    "@/lib/sessionKeys"
  );
  return {
    ...actual,
    ensureSessionAccessKeys: sessionKeysMocks.ensureSessionAccessKeys,
  };
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

vi.mock("@/store/dragStore", () => {
  const useDragStore = (selector: any) => selector(mockDragState);
  useDragStore.getState = () => mockDragState;
  return { useDragStore };
});

vi.mock("@/store/selectionStore", () => {
  const useSelectionStore = (selector: any) => selector(mockSelectionState);
  useSelectionStore.getState = () => mockSelectionState;
  return { useSelectionStore };
});

vi.mock("@/store/clientPrefsStore", () => {
  const useClientPrefsStore = (selector: any) => selector(mockPrefsState);
  useClientPrefsStore.getState = () => mockPrefsState;
  return { useClientPrefsStore };
});

vi.mock("@/lib/playerColors", () => ({
  resolvePlayerColors: () => ({}),
  resolveOrderedPlayerIds: () => [],
}));

vi.mock("@/logging/logStore", () => ({
  emitLog: vi.fn(),
}));

vi.mock("../useBoardScale", () => ({
  useBoardScale: () => 1,
}));

vi.mock("../../context-menu/useGameContextMenu", () => ({
  useGameContextMenu: () => ({
    contextMenu: null,
    handleCardContextMenu: vi.fn(),
    handleZoneContextMenu: vi.fn(),
    handleBattlefieldContextMenu: vi.fn(),
    handleLifeContextMenu: vi.fn(),
    closeContextMenu: vi.fn(),
    countPrompt: null,
    openCountPrompt: vi.fn(),
    closeCountPrompt: vi.fn(),
    textPrompt: null,
    closeTextPrompt: vi.fn(),
    topCardRevealPrompt: null,
    closeTopCardRevealPrompt: vi.fn(),
  }),
}));

vi.mock("../../dnd/useGameDnD", () => ({
  useGameDnD: () => ({
    sensors: [],
    handleDragStart: vi.fn(),
    handleDragMove: vi.fn(),
    handleDragEnd: vi.fn(),
  }),
}));

vi.mock("../../selection/useSelectionSync", () => ({
  useSelectionSync: vi.fn(),
}));

vi.mock("../../shortcuts/useGameShortcuts", () => ({
  useGameShortcuts: vi.fn(),
}));

vi.mock("../../shortcuts/model", () => ({
  areShortcutsBlockedByUi: () => false,
}));

vi.mock("../../multiplayer-sync/useMultiplayerSync", () => ({
  useMultiplayerSync: () => ({
    status: "connected",
    peerCounts: { total: 1, players: 1, spectators: 0 },
    joinBlocked: false,
    joinBlockedReason: null,
  }),
}));

vi.mock("../../player/usePlayerLayout", () => ({
  usePlayerLayout: () => ({
    slots: [],
    layoutMode: "single",
    myPlayerId: "player-1",
  }),
}));

import { useMultiplayerBoardController } from "../useMultiplayerBoardController";

describe("useMultiplayerBoardController copy link", () => {
  beforeEach(() => {
    mockGameState.roomLockedByHost = false;
    clipboardMocks.writeText.mockClear();
    sessionKeysMocks.ensureSessionAccessKeys.mockClear();
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: clipboardMocks.writeText },
      configurable: true,
    });
  });

  it("copies a player link when the room is unlocked", async () => {
    mockGameState.roomLockedByHost = false;

    const { result } = renderHook(() =>
      useMultiplayerBoardController("session-123")
    );

    await act(async () => {
      await result.current.handleCopyLink();
    });

    const expected = buildSessionLink({
      sessionId: "session-123",
      role: "player",
      keys: { playerKey: "player-key", spectatorKey: "spectator-key" },
    });

    expect(sessionKeysMocks.ensureSessionAccessKeys).toHaveBeenCalledWith(
      "session-123"
    );
    expect(clipboardMocks.writeText).toHaveBeenCalledWith(expected);
  });

  it("copies a spectator link when the room is locked", async () => {
    mockGameState.roomLockedByHost = true;

    const { result } = renderHook(() =>
      useMultiplayerBoardController("session-locked")
    );

    await act(async () => {
      await result.current.handleCopyLink();
    });

    const expected = buildSessionLink({
      sessionId: "session-locked",
      role: "spectator",
      keys: { playerKey: "player-key", spectatorKey: "spectator-key" },
    });

    expect(sessionKeysMocks.ensureSessionAccessKeys).toHaveBeenCalledWith(
      "session-locked"
    );
    expect(clipboardMocks.writeText).toHaveBeenCalledWith(expected);
  });
});
