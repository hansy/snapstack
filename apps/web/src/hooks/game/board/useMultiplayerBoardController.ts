import * as React from "react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";

import { useDragStore } from "@/store/dragStore";
import { useClientPrefsStore } from "@/store/clientPrefsStore";
import { useGameStore } from "@/store/gameStore";
import { computePlayerColors, resolveOrderedPlayerIds } from "@/lib/playerColors";
import { useBattlefieldEdgeZoom } from "./useBattlefieldEdgeZoom";
import { useBoardScale } from "./useBoardScale";
import { useGameContextMenu } from "../context-menu/useGameContextMenu";
import { useGameDnD } from "../dnd/useGameDnD";
import { useGameShortcuts } from "../shortcuts/useGameShortcuts";
import { useMultiplayerSync } from "../multiplayer-sync/useMultiplayerSync";
import { usePlayerLayout, type LayoutMode } from "../player/usePlayerLayout";

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
  const battlefieldViewScale = useGameStore((state) => state.battlefieldViewScale);
  const activeModal = useGameStore((state) => state.activeModal);
  const setActiveModal = useGameStore((state) => state.setActiveModal);

  const overCardScale = useDragStore((state) => state.overCardScale);
  const activeCardId = useDragStore((state) => state.activeCardId);
  const { sensors, handleDragStart, handleDragMove, handleDragEnd } = useGameDnD();

  const { slots, layoutMode, myPlayerId } = usePlayerLayout();
  const gridClass = React.useMemo(() => getGridClass(layoutMode), [layoutMode]);

  const { status: syncStatus, peers } = useMultiplayerSync(sessionId);

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

  const {
    contextMenu,
    handleCardContextMenu,
    handleZoneContextMenu,
    handleBattlefieldContextMenu,
    closeContextMenu,
    countPrompt,
    openCountPrompt,
    closeCountPrompt,
    textPrompt,
    closeTextPrompt,
  } = useGameContextMenu(myPlayerId, handleViewZone);

  const [isLoadDeckModalOpen, setIsLoadDeckModalOpen] = React.useState(false);
  const [isTokenModalOpen, setIsTokenModalOpen] = React.useState(false);
  const [isLogOpen, setIsLogOpen] = React.useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = React.useState(false);
  const [isEditUsernameOpen, setIsEditUsernameOpen] = React.useState(false);
  const [revealedLibraryZoneId, setRevealedLibraryZoneId] = React.useState<string | null>(
    null
  );

  const preferredUsername = useClientPrefsStore((state) => state.username);
  const setPreferredUsername = useClientPrefsStore((state) => state.setUsername);

  const handleUsernameSubmit = React.useCallback(
    (username: string) => {
      setPreferredUsername(username);
      useGameStore.getState().updatePlayer(myPlayerId, { name: username }, myPlayerId);
      setIsEditUsernameOpen(false);
    },
    [myPlayerId, setPreferredUsername]
  );

  const handleDrawCard = React.useCallback(
    (playerId: string) => {
      useGameStore.getState().drawCard(playerId, myPlayerId);
    },
    [myPlayerId]
  );

  useGameShortcuts({
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
    loadDeckModalOpen: isLoadDeckModalOpen,
    setLoadDeckModalOpen: setIsLoadDeckModalOpen,
    zoneViewerOpen: zoneViewerState.isOpen,
    closeZoneViewer: () => setZoneViewerState((prev) => ({ ...prev, isOpen: false })),
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
  useBattlefieldEdgeZoom(myPlayerId);

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
    sensors,
    handleDragStart,
    handleDragMove,
    handleDragEnd,
    syncStatus,
    peers,
    handleViewZone,
    contextMenu,
    handleCardContextMenu,
    handleZoneContextMenu,
    handleBattlefieldContextMenu,
    closeContextMenu,
    countPrompt,
    closeCountPrompt,
    textPrompt,
    closeTextPrompt,
    isLoadDeckModalOpen,
    setIsLoadDeckModalOpen,
    isTokenModalOpen,
    setIsTokenModalOpen,
    isLogOpen,
    setIsLogOpen,
    isShortcutsOpen,
    setIsShortcutsOpen,
    isEditUsernameOpen,
    setIsEditUsernameOpen,
    zoneViewerState,
    setZoneViewerState,
    revealedLibraryZoneId,
    setRevealedLibraryZoneId,
    preferredUsername,
    handleUsernameSubmit,
    handleDrawCard,
    handleCopyLink,
    handleLeave,
  };
};

export type MultiplayerBoardController = ReturnType<typeof useMultiplayerBoardController>;
