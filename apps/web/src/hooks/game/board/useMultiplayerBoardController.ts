import * as React from "react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";

import { useDragStore } from "@/store/dragStore";
import { useClientPrefsStore } from "@/store/clientPrefsStore";
import { useGameStore } from "@/store/gameStore";
import { useSelectionStore } from "@/store/selectionStore";
import {
  computePlayerColors,
  resolveOrderedPlayerIds,
} from "@/lib/playerColors";
import { emitLog } from "@/logging/logStore";
import { useBoardScale } from "./useBoardScale";
import { useGameContextMenu } from "../context-menu/useGameContextMenu";
import { useGameDnD } from "../dnd/useGameDnD";
import { useSelectionSync } from "../selection/useSelectionSync";
import { useGameShortcuts } from "../shortcuts/useGameShortcuts";
import { areShortcutsBlockedByUi } from "../shortcuts/model";
import { useMultiplayerSync } from "../multiplayer-sync/useMultiplayerSync";
import { usePlayerLayout, type LayoutMode } from "../player/usePlayerLayout";
import { resolveSelectedCardIds } from "@/models/game/selection/selectionModel";
import { MAX_ROOM_PLAYERS } from "@/lib/room";

const getGridClass = (layoutMode: LayoutMode) => {
  switch (layoutMode) {
    case "single":
      return "grid-cols-1 grid-rows-1";
    case "split":
      return "grid-cols-1 grid-rows-2";
    case "quadrant":
      return "grid-cols-2 grid-rows-2";
    default:
      return "grid-cols-1 grid-rows-1";
  }
};

export const useMultiplayerBoardController = (sessionId: string) => {
  const navigate = useNavigate();

  const zones = useGameStore((state) => state.zones);
  const cards = useGameStore((state) => state.cards);
  const players = useGameStore((state) => state.players);
  const playerOrder = useGameStore((state) => state.playerOrder);
  const battlefieldViewScale = useGameStore(
    (state) => state.battlefieldViewScale
  );
  const viewerRole = useGameStore((state) => state.viewerRole);
  const setViewerRole = useGameStore((state) => state.setViewerRole);
  const roomHostId = useGameStore((state) => state.roomHostId);
  const roomLockedByHost = useGameStore((state) => state.roomLockedByHost);
  const roomOverCapacity = useGameStore((state) => state.roomOverCapacity);
  const setRoomLockedByHost = useGameStore((state) => state.setRoomLockedByHost);
  const activeModal = useGameStore((state) => state.activeModal);
  const setActiveModal = useGameStore((state) => state.setActiveModal);

  const overCardScale = useDragStore((state) => state.overCardScale);
  const activeCardId = useDragStore((state) => state.activeCardId);
  const isGroupDragging = useDragStore((state) => state.isGroupDragging);
  const ghostCards = useDragStore((state) => state.ghostCards);
  const selectedCardIds = useSelectionStore((state) => state.selectedCardIds);
  const selectionZoneId = useSelectionStore((state) => state.selectionZoneId);
  const { sensors, handleDragStart, handleDragMove, handleDragEnd } =
    useGameDnD({ viewerRole });

  const { slots, layoutMode, myPlayerId } = usePlayerLayout();
  const gridClass = React.useMemo(() => getGridClass(layoutMode), [layoutMode]);

  const { status: syncStatus, peerCounts, joinBlocked, joinBlockedReason } =
    useMultiplayerSync(sessionId);

  const [zoneViewerState, setZoneViewerState] = React.useState<{
    isOpen: boolean;
    zoneId: string | null;
    count?: number;
  }>({ isOpen: false, zoneId: null });

  const handleViewZone = React.useCallback((zoneId: string, count?: number) => {
    setZoneViewerState({ isOpen: true, zoneId, count });
  }, []);

  const handleLeave = React.useCallback(() => {
    useGameStore.getState().leaveGame();
    navigate({ to: "/" });
  }, [navigate]);

  const handleCopyLink = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success("Link copied to clipboard");
    } catch (err) {
      console.error("Failed to copy link", err);
      toast.error("Failed to copy link");
    }
  }, []);

  const isSpectator = viewerRole === "spectator";

  const {
    contextMenu,
    handleCardContextMenu,
    handleZoneContextMenu,
    handleBattlefieldContextMenu,
    handleLifeContextMenu,
    closeContextMenu,
    countPrompt,
    openCountPrompt,
    closeCountPrompt,
    textPrompt,
    closeTextPrompt,
  } = useGameContextMenu(viewerRole, myPlayerId, handleViewZone, () =>
    setIsDiceRollerOpen(true)
  );

  const [isLoadDeckModalOpen, setIsLoadDeckModalOpen] = React.useState(false);
  const [isTokenModalOpen, setIsTokenModalOpen] = React.useState(false);
  const [isDiceRollerOpen, setIsDiceRollerOpen] = React.useState(false);
  const [isLogOpen, setIsLogOpen] = React.useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = React.useState(false);
  const [isEditUsernameOpen, setIsEditUsernameOpen] = React.useState(false);
  const [revealedLibraryZoneId, setRevealedLibraryZoneId] = React.useState<
    string | null
  >(null);

  const preferredUsername = useClientPrefsStore((state) => state.username);
  const setPreferredUsername = useClientPrefsStore(
    (state) => state.setUsername
  );

  const handleUsernameSubmit = React.useCallback(
    (username: string) => {
      setPreferredUsername(username);
      useGameStore
        .getState()
        .updatePlayer(myPlayerId, { name: username }, myPlayerId);
      setIsEditUsernameOpen(false);
    },
    [myPlayerId, setPreferredUsername]
  );

  const handleDrawCard = React.useCallback(
    (playerId: string) => {
      if (isSpectator) return;
      useGameStore.getState().drawCard(playerId, myPlayerId);
    },
    [isSpectator, myPlayerId]
  );

  const handleRollDice = React.useCallback(
    (params: { sides: number; count: number }) => {
      if (isSpectator) return;
      const safeSides = Math.max(1, Math.floor(params.sides));
      const safeCount = Math.max(1, Math.floor(params.count));
      const results = Array.from(
        { length: safeCount },
        () => 1 + Math.floor(Math.random() * safeSides)
      );
      const state = useGameStore.getState();
      emitLog(
        "dice.roll",
        { actorId: myPlayerId, sides: safeSides, count: safeCount, results },
        { players: state.players, cards: state.cards, zones: state.zones }
      );
    },
    [isSpectator, myPlayerId]
  );

  const handleOpenDiceRoller = React.useCallback(() => {
    if (isSpectator) return;
    setIsDiceRollerOpen(true);
  }, [isSpectator]);

  const playerCount = Object.keys(players).length;
  const roomIsFull = playerCount >= MAX_ROOM_PLAYERS;
  const roomLocked = roomLockedByHost || roomIsFull;
  const isHost = roomHostId === myPlayerId;
  const isJoinBlocked = !isSpectator && joinBlocked && !players[myPlayerId];

  const handleToggleRoomLock = React.useCallback(() => {
    if (!isHost || roomIsFull) return;
    setRoomLockedByHost(!roomLockedByHost);
  }, [isHost, roomIsFull, roomLockedByHost, setRoomLockedByHost]);

  const zoomControlsBlocked = areShortcutsBlockedByUi({
    contextMenuOpen: Boolean(contextMenu),
    countPromptOpen: Boolean(countPrompt),
    textPromptOpen: Boolean(textPrompt),
    activeModalOpen: Boolean(activeModal),
    tokenModalOpen: isTokenModalOpen,
    diceRollerOpen: isDiceRollerOpen,
    loadDeckModalOpen: isLoadDeckModalOpen,
    zoneViewerOpen: zoneViewerState.isOpen,
    opponentRevealsOpen: Boolean(revealedLibraryZoneId),
  });

  useGameShortcuts({
    viewerRole,
    myPlayerId,
    zones,
    players,
    contextMenuOpen: Boolean(contextMenu),
    closeContextMenu,
    countPromptOpen: Boolean(countPrompt),
    closeCountPrompt,
    textPromptOpen: Boolean(textPrompt),
    closeTextPrompt,
    activeModalOpen: Boolean(activeModal),
    closeActiveModal: () => setActiveModal(null),
    tokenModalOpen: isTokenModalOpen,
    setTokenModalOpen: setIsTokenModalOpen,
    diceRollerOpen: isDiceRollerOpen,
    setDiceRollerOpen: setIsDiceRollerOpen,
    loadDeckModalOpen: isLoadDeckModalOpen,
    setLoadDeckModalOpen: setIsLoadDeckModalOpen,
    zoneViewerOpen: zoneViewerState.isOpen,
    closeZoneViewer: () =>
      setZoneViewerState((prev) => ({ ...prev, isOpen: false })),
    opponentRevealsOpen: Boolean(revealedLibraryZoneId),
    closeOpponentReveals: () => setRevealedLibraryZoneId(null),
    logOpen: isLogOpen,
    setLogOpen: setIsLogOpen,
    shortcutsOpen: isShortcutsOpen,
    setShortcutsOpen: setIsShortcutsOpen,
    openCountPrompt,
    handleViewZone,
    handleLeave,
  });

  const playerColors = React.useMemo(() => {
    const orderedIds = resolveOrderedPlayerIds(players, playerOrder);
    const canonical = computePlayerColors(orderedIds);
    const colors: Record<string, string> = { ...canonical };
    Object.entries(players).forEach(([id, player]) => {
      if (player?.color) colors[id] = player.color;
    });
    return colors;
  }, [players, playerOrder]);

  const scale = useBoardScale(layoutMode);
  useSelectionSync(myPlayerId);

  const groupDragCardIds = React.useMemo(() => {
    if (!isGroupDragging || !activeCardId) return [];
    return resolveSelectedCardIds({
      seedCardId: activeCardId,
      cardsById: cards,
      selection: { selectedCardIds, selectionZoneId },
      minCount: 2,
      fallbackToSeed: false,
    });
  }, [
    activeCardId,
    cards,
    isGroupDragging,
    selectedCardIds,
    selectionZoneId,
  ]);

  const showGroupDragOverlay = React.useMemo(
    () =>
      Boolean(
        isGroupDragging &&
          (!ghostCards || ghostCards.length < 2) &&
          groupDragCardIds.length > 0
      ),
    [ghostCards, groupDragCardIds.length, isGroupDragging]
  );

  return {
    zones,
    cards,
    players,
    battlefieldViewScale,
    playerColors,
    gridClass,
    scale,
    myPlayerId,
    slots,
    activeModal,
    setActiveModal,
    overCardScale,
    activeCardId,
    isGroupDragging,
    showGroupDragOverlay,
    groupDragCardIds,
    sensors,
    handleDragStart,
    handleDragMove,
    handleDragEnd,
    syncStatus,
    peerCounts,
    handleViewZone,
    contextMenu,
    handleCardContextMenu,
    handleZoneContextMenu,
    handleBattlefieldContextMenu,
    handleLifeContextMenu,
    handleOpenDiceRoller,
    closeContextMenu,
    countPrompt,
    closeCountPrompt,
    textPrompt,
    closeTextPrompt,
    isLoadDeckModalOpen,
    setIsLoadDeckModalOpen,
    isTokenModalOpen,
    setIsTokenModalOpen,
    isDiceRollerOpen,
    setIsDiceRollerOpen,
    isLogOpen,
    setIsLogOpen,
    isShortcutsOpen,
    setIsShortcutsOpen,
    zoomControlsBlocked,
    isEditUsernameOpen,
    setIsEditUsernameOpen,
    zoneViewerState,
    setZoneViewerState,
    revealedLibraryZoneId,
    setRevealedLibraryZoneId,
    preferredUsername,
    handleUsernameSubmit,
    handleDrawCard,
    handleRollDice,
    handleCopyLink,
    handleLeave,
    isHost,
    roomLocked,
    roomIsFull,
    onToggleRoomLock: handleToggleRoomLock,
    joinBlocked: isJoinBlocked,
    joinBlockedReason,
    roomOverCapacity,
    viewerRole,
    setViewerRole,
  };
};

export type MultiplayerBoardController = ReturnType<
  typeof useMultiplayerBoardController
>;
