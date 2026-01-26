import { renderHook, act, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockReadRoomTokensFromStorage = vi.hoisted(() => vi.fn());

const mockGameState = vi.hoisted(() => ({
  zones: {},
  cards: {},
  players: {},
  libraryRevealsToAll: {},
  playerOrder: [],
  battlefieldViewScale: {},
  viewerRole: "player" as const,
  setViewerRole: vi.fn(),
  roomHostId: "player-1",
  roomLockedByHost: false,
  roomOverCapacity: false,
  roomTokens: null as any,
  setRoomLockedByHost: vi.fn(),
  activeModal: null as any,
  setActiveModal: vi.fn(),
  myPlayerId: "player-1",
  leaveGame: vi.fn(),
  updatePlayer: vi.fn(),
  drawCard: vi.fn(),
}));

const mockDragState = vi.hoisted(() => ({
  overCardScale: 1,
  activeCardId: null as string | null,
  isGroupDragging: false,
  ghostCards: null as any,
}));

const mockSelectionState = vi.hoisted(() => ({
  selectedCardIds: [] as string[],
  selectionZoneId: null as string | null,
}));

const mockPrefsState = vi.hoisted(() => ({
  username: "tester",
  setUsername: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
}));

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

vi.mock("@/lib/playerColors", () => {
  const PLAYER_COLOR_PALETTE = [
    "red",
    "blue",
    "green",
    "yellow",
  ];
  return {
    PLAYER_COLOR_PALETTE,
    resolvePlayerColors: () => ({}),
    computePlayerColors: (ids: string[]) =>
      ids.reduce<Record<string, string>>((acc, id, index) => {
        acc[id] = PLAYER_COLOR_PALETTE[index % PLAYER_COLOR_PALETTE.length];
        return acc;
      }, {}),
    resolveOrderedPlayerIds: (
      players: Record<string, unknown>,
      playerOrder: string[],
    ) => (playerOrder.length ? playerOrder : Object.keys(players)),
    isPlayerColor: (value: unknown) => typeof value === "string",
  };
});

vi.mock("@/constants/zones", () => ({
  ZONE: { LIBRARY: "LIBRARY", BATTLEFIELD: "BATTLEFIELD" },
}));

vi.mock("@/hooks/scryfall/useScryfallCard", () => ({
  useScryfallCards: vi.fn(),
}));

vi.mock("uuid", () => ({
  v4: () => "uuid-1",
}));

vi.mock("@/partykit/intentTransport", () => ({
  sendIntent: vi.fn(),
}));

vi.mock("@/lib/partyKitToken", () => ({
  clearRoomHostPending: vi.fn(),
  clearRoomUnavailable: vi.fn(),
  isRoomHostPending: vi.fn(() => false),
  isRoomUnavailable: vi.fn(() => false),
  markRoomUnavailable: vi.fn(),
  markRoomAsHostPending: vi.fn(),
  readRoomTokensFromStorage: mockReadRoomTokensFromStorage,
  resolveInviteTokenFromUrl: vi.fn(() => ({})),
  writeRoomTokensToStorage: vi.fn(),
}));

vi.mock("../useBoardScale", () => ({
  useBoardScale: () => 1,
}));

vi.mock("../context-menu/useGameContextMenu", () => ({
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
  }),
}));

vi.mock("../dnd/useGameDnD", () => ({
  useGameDnD: () => ({
    sensors: [],
    handleDragStart: vi.fn(),
    handleDragMove: vi.fn(),
    handleDragEnd: vi.fn(),
  }),
}));

vi.mock("../selection/useSelectionSync", () => ({
  useSelectionSync: vi.fn(),
}));

vi.mock("../shortcuts/useGameShortcuts", () => ({
  useGameShortcuts: vi.fn(),
}));

vi.mock("../shortcuts/model", () => ({
  areShortcutsBlockedByUi: () => false,
}));

vi.mock("../multiplayer-sync/useMultiplayerSync", () => ({
  useMultiplayerSync: () => ({
    status: "connected",
    peerCounts: { total: 1, players: 1, spectators: 0 },
    joinBlocked: false,
    joinBlockedReason: null,
  }),
}));

vi.mock("../player/usePlayerLayout", () => ({
  usePlayerLayout: () => ({
    slots: [],
    layoutMode: "single",
    myPlayerId: "player-1",
  }),
}));

vi.mock("@/models/game/selection/selectionModel", () => ({
  resolveSelectedCardIds: () => [],
}));

vi.mock("@/lib/room", () => ({
  MAX_PLAYERS: 4,
}));

import { useMultiplayerBoardController } from "../useMultiplayerBoardController";

describe("useMultiplayerBoardController", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadRoomTokensFromStorage.mockReturnValue({ playerToken: "token-123" });
    Object.assign(mockGameState, {
      zones: {},
      cards: {},
      players: {},
      playerOrder: [],
      battlefieldViewScale: {},
      viewerRole: "player",
      roomTokens: null,
      roomLockedByHost: false,
      roomOverCapacity: false,
      activeModal: null,
    });
    window.history.replaceState({}, "", "/game/room-1");
  });

  it("unlocks share links using stored tokens", async () => {
    const { result } = renderHook(() => useMultiplayerBoardController("room-1"));

    expect(mockReadRoomTokensFromStorage).toHaveBeenCalledWith("room-1");
    expect(result.current.shareLinksReady).toBe(true);

    act(() => {
      result.current.setIsShareDialogOpen(true);
    });

    await waitFor(() =>
      expect(result.current.shareLinks.players).toContain("gt=token-123")
    );
    expect(result.current.shareLinks.spectators).toContain("room-1");
    expect(result.current.shareLinks.spectators).not.toContain("gt=");
    expect(result.current.shareLinks.spectators).not.toContain("st=");
  });
});
