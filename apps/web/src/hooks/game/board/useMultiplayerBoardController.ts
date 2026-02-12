import * as React from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";

import { useDragStore } from "@/store/dragStore";
import { useClientPrefsStore } from "@/store/clientPrefsStore";
import { useGameStore } from "@/store/gameStore";
import { useSelectionStore } from "@/store/selectionStore";
import { resolvePlayerColors } from "@/lib/playerColors";
import { ZONE } from "@/constants/zones";
import { useScryfallCards } from "@/hooks/scryfall/useScryfallCard";
import { v4 as uuidv4 } from "uuid";
import { sendIntent } from "@/partykit/intentTransport";
import {
  markRoomAsHostPending,
  readRoomTokensFromStorage,
} from "@/lib/partyKitToken";
import { createRoomId } from "@/lib/roomId";
import { useGameContextMenu } from "../context-menu/useGameContextMenu";
import { useGameDnD } from "../dnd/useGameDnD";
import { useSelectionSync } from "../selection/useSelectionSync";
import { useGameShortcuts } from "../shortcuts/useGameShortcuts";
import { areShortcutsBlockedByUi } from "../shortcuts/model";
import { useMultiplayerSync } from "../multiplayer-sync/useMultiplayerSync";
import { usePlayerLayout, type LayoutMode } from "../player/usePlayerLayout";
import { resolveSelectedCardIds } from "@/models/game/selection/selectionModel";
import { MAX_PLAYERS } from "@/lib/room";
import { useIdleTimeout } from "@/hooks/shared/useIdleTimeout";

const IDLE_TIMEOUT_MS = 10 * 60_000;
const IDLE_POLL_MS = 30_000;

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

const getDefaultLogOpen = () => {
  if (typeof window === "undefined" || !window.matchMedia) return true;
  const isPortraitTouch =
    window.matchMedia("(pointer: coarse)").matches &&
    window.matchMedia("(orientation: portrait)").matches;
  return !isPortraitTouch;
};

export const useMultiplayerBoardController = (sessionId: string) => {
  const navigate = useNavigate();

  const zones = useGameStore((state) => state.zones);
  const cards = useGameStore((state) => state.cards);
  const scryfallIds = React.useMemo(
    () =>
      Object.values(cards)
        .map((card) => card.scryfallId)
        .filter((id): id is string => Boolean(id)),
    [cards],
  );
  useScryfallCards(scryfallIds);
  const players = useGameStore((state) => state.players);
  const libraryRevealsToAll = useGameStore(
    (state) => state.libraryRevealsToAll,
  );
  const playerOrder = useGameStore((state) => state.playerOrder);
  const battlefieldViewScale = useGameStore(
    (state) => state.battlefieldViewScale,
  );
  const battlefieldGridSizing = useGameStore(
    (state) => state.battlefieldGridSizing
  );
  const viewerRole = useGameStore((state) => state.viewerRole);
  const setViewerRole = useGameStore((state) => state.setViewerRole);
  const roomHostId = useGameStore((state) => state.roomHostId);
  const roomLockedByHost = useGameStore((state) => state.roomLockedByHost);
  const roomOverCapacity = useGameStore((state) => state.roomOverCapacity);
  const roomTokens = useGameStore((state) => state.roomTokens);
  const storedTokens = React.useMemo(
    () => readRoomTokensFromStorage(sessionId),
    [sessionId, roomTokens?.playerToken, roomTokens?.spectatorToken],
  );
  const shareTokenSource = roomTokens ?? storedTokens;
  const setRoomLockedByHost = useGameStore(
    (state) => state.setRoomLockedByHost,
  );
  const activeModal = useGameStore((state) => state.activeModal);
  const setActiveModal = useGameStore((state) => state.setActiveModal);
  const shareLinksReady = Boolean(
    shareTokenSource?.playerToken || shareTokenSource?.spectatorToken,
  );

  const overCardScale = useDragStore((state) => state.overCardScale);
  const activeCardId = useDragStore((state) => state.activeCardId);
  const activeCardScale = useDragStore((state) => state.activeCardScale);
  const isGroupDragging = useDragStore((state) => state.isGroupDragging);
  const ghostCards = useDragStore((state) => state.ghostCards);
  const selectedCardIds = useSelectionStore((state) => state.selectedCardIds);
  const selectionZoneId = useSelectionStore((state) => state.selectionZoneId);
  const { sensors, handleDragStart, handleDragMove, handleDragEnd } =
    useGameDnD({ viewerRole });

  const { slots, layoutMode, myPlayerId } = usePlayerLayout();
  const gridClass = React.useMemo(() => getGridClass(layoutMode), [layoutMode]);

  const locationSearch = useRouterState({
    select: (state) => state.location.search,
  }) as string;
  const {
    status: syncStatus,
    peerCounts,
    joinBlocked,
    joinBlockedReason,
  } = useMultiplayerSync(sessionId, locationSearch);

  const [zoneViewerState, setZoneViewerState] = React.useState<{
    isOpen: boolean;
    zoneId: string | null;
    count?: number;
  }>({ isOpen: false, zoneId: null });

  const sendLogIntent = React.useCallback(
    (type: string, payload: Record<string, unknown>) => {
      sendIntent({ id: uuidv4(), type, payload });
    },
    [],
  );

  const handleViewZone = React.useCallback(
    (zoneId: string, count?: number) => {
      setZoneViewerState({ isOpen: true, zoneId, count });

      const state = useGameStore.getState();
      const zone = state.zones[zoneId];
      if (!zone || zone.type !== ZONE.LIBRARY) return;
      if (state.viewerRole === "spectator") return;
      if (zone.ownerId !== state.myPlayerId) return;

      const safeCount =
        typeof count === "number" && Number.isFinite(count) && count > 0
          ? Math.floor(count)
          : undefined;

      sendLogIntent("library.view", {
        actorId: state.myPlayerId,
        playerId: state.myPlayerId,
        count: safeCount,
      });
    },
    [sendLogIntent],
  );

  const libraryViewPlayerIdRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!zoneViewerState.isOpen || !zoneViewerState.zoneId) return;
    const state = useGameStore.getState();
    const zone = state.zones[zoneViewerState.zoneId];
    if (!zone || zone.type !== ZONE.LIBRARY) return;
    if (state.viewerRole === "spectator") return;
    if (!state.myPlayerId || zone.ownerId !== state.myPlayerId) return;

    const playerId = zone.ownerId;
    libraryViewPlayerIdRef.current = playerId;

    const ping = () => {
      sendLogIntent("library.view.ping", {
        actorId: state.myPlayerId,
        playerId,
      });
    };
    ping();
    const interval = window.setInterval(ping, 12_000);

    return () => {
      window.clearInterval(interval);
      if (libraryViewPlayerIdRef.current === playerId) {
        sendLogIntent("library.view.close", {
          actorId: state.myPlayerId,
          playerId,
        });
        libraryViewPlayerIdRef.current = null;
      }
    };
  }, [sendLogIntent, zoneViewerState.isOpen, zoneViewerState.zoneId]);

  const handleLeave = React.useCallback(() => {
    useGameStore.getState().leaveGame();
    navigate({ to: "/" });
  }, [navigate]);

  const isSpectator = viewerRole === "spectator";

  const handleIdleTimeout = React.useCallback(() => {
    navigate({ to: "/" });
  }, [navigate]);

  const idleEnabled =
    syncStatus === "connected" && !joinBlocked && !isSpectator;
  useIdleTimeout({
    enabled: idleEnabled,
    timeoutMs: IDLE_TIMEOUT_MS,
    pollIntervalMs: IDLE_POLL_MS,
    onTimeout: handleIdleTimeout,
  });

  const handleCreateNewGame = React.useCallback(() => {
    useGameStore.getState().leaveGame();
    const sessionId = createRoomId();
    markRoomAsHostPending(sessionId);
    navigate({ to: "/game/$sessionId", params: { sessionId } });
  }, [navigate]);

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
  } = useGameContextMenu(
    viewerRole,
    myPlayerId,
    handleViewZone,
    () => setIsCoinFlipperOpen(true),
    () => setIsDiceRollerOpen(true),
  );

  const [isLoadDeckModalOpen, setIsLoadDeckModalOpen] = React.useState(false);
  const [isTokenModalOpen, setIsTokenModalOpen] = React.useState(false);
  const [isCoinFlipperOpen, setIsCoinFlipperOpen] = React.useState(false);
  const [isDiceRollerOpen, setIsDiceRollerOpen] = React.useState(false);
  const [isLogOpen, setIsLogOpen] = React.useState(getDefaultLogOpen);
  const [isShortcutsOpen, setIsShortcutsOpen] = React.useState(false);
  const [isShareDialogOpen, setIsShareDialogOpen] = React.useState(false);
  const [isEditUsernameOpen, setIsEditUsernameOpen] = React.useState(false);
  const [revealedLibraryZoneId, setRevealedLibraryZoneId] = React.useState<
    string | null
  >(null);
  const [shareLinks, setShareLinks] = React.useState({
    players: "",
    spectators: "",
  });
  const buildShareLink = React.useCallback(
    (tokenParam?: { name: "gt" | "st"; value: string }) => {
      if (typeof window === "undefined") return "";
      const url = new URL(window.location.href);
      url.searchParams.delete("gt");
      url.searchParams.delete("st");
      url.searchParams.delete("viewerRole");
      url.searchParams.delete("playerToken");
      url.searchParams.delete("spectatorToken");
      url.searchParams.delete("token");
      url.searchParams.delete("role");
      if (tokenParam) {
        url.searchParams.set(tokenParam.name, tokenParam.value);
      }
      return url.toString();
    },
    [],
  );

  React.useEffect(() => {
    if (!isShareDialogOpen) return;
    if (!shareLinksReady) {
      setShareLinks({ players: "", spectators: "" });
      return;
    }
    const base = buildShareLink();
    const playerLink = shareTokenSource?.playerToken
      ? buildShareLink({ name: "gt", value: shareTokenSource.playerToken })
      : base;
    const spectatorLink = shareTokenSource?.spectatorToken
      ? buildShareLink({ name: "st", value: shareTokenSource.spectatorToken })
      : base;
    setShareLinks({ players: playerLink, spectators: spectatorLink });
  }, [
    buildShareLink,
    isShareDialogOpen,
    shareLinksReady,
    shareTokenSource?.playerToken,
    shareTokenSource?.spectatorToken,
  ]);

  const preferredUsername = useClientPrefsStore((state) => state.username);
  const setPreferredUsername = useClientPrefsStore(
    (state) => state.setUsername,
  );

  const handleUsernameSubmit = React.useCallback(
    (username: string) => {
      setPreferredUsername(username);
      useGameStore
        .getState()
        .updatePlayer(myPlayerId, { name: username }, myPlayerId);
      setIsEditUsernameOpen(false);
    },
    [myPlayerId, setPreferredUsername],
  );

  const handleDrawCard = React.useCallback(
    (playerId: string) => {
      if (isSpectator) return;
      useGameStore.getState().drawCard(playerId, myPlayerId);
    },
    [isSpectator, myPlayerId],
  );

  const handleFlipCoin = React.useCallback(
    (params: { count: number }) => {
      if (isSpectator) return;
      const safeCount = Math.max(1, Math.floor(params.count));
      const results = Array.from(
        { length: safeCount },
        () => (Math.random() < 0.5 ? "heads" : "tails") as "heads" | "tails",
      );
      sendLogIntent("coin.flip", {
        actorId: myPlayerId,
        count: safeCount,
        results,
      });
    },
    [isSpectator, myPlayerId, sendLogIntent],
  );

  const handleRollDice = React.useCallback(
    (params: { sides: number; count: number }) => {
      if (isSpectator) return;
      const safeSides = Math.max(1, Math.floor(params.sides));
      const safeCount = Math.max(1, Math.floor(params.count));
      const results = Array.from(
        { length: safeCount },
        () => 1 + Math.floor(Math.random() * safeSides),
      );
      sendLogIntent("dice.roll", {
        actorId: myPlayerId,
        sides: safeSides,
        count: safeCount,
        results,
      });
    },
    [isSpectator, myPlayerId, sendLogIntent],
  );

  const handleOpenCoinFlipper = React.useCallback(() => {
    if (isSpectator) return;
    setIsCoinFlipperOpen(true);
  }, [isSpectator]);

  const handleOpenDiceRoller = React.useCallback(() => {
    if (isSpectator) return;
    setIsDiceRollerOpen(true);
  }, [isSpectator]);

  const playerCount = Object.keys(players).length;
  const roomIsFull = playerCount >= MAX_PLAYERS;
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
    coinFlipperOpen: isCoinFlipperOpen,
    diceRollerOpen: isDiceRollerOpen,
    loadDeckModalOpen: isLoadDeckModalOpen,
    shareDialogOpen: isShareDialogOpen,
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
    coinFlipperOpen: isCoinFlipperOpen,
    setCoinFlipperOpen: setIsCoinFlipperOpen,
    diceRollerOpen: isDiceRollerOpen,
    setDiceRollerOpen: setIsDiceRollerOpen,
    loadDeckModalOpen: isLoadDeckModalOpen,
    setLoadDeckModalOpen: setIsLoadDeckModalOpen,
    shareDialogOpen: isShareDialogOpen,
    setShareDialogOpen: setIsShareDialogOpen,
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

  const playerColors = React.useMemo(
    () => resolvePlayerColors(players, playerOrder),
    [players, playerOrder],
  );

  const scale = 1;
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
  }, [activeCardId, cards, isGroupDragging, selectedCardIds, selectionZoneId]);

  const showGroupDragOverlay = React.useMemo(
    () =>
      Boolean(
        isGroupDragging &&
        (!ghostCards || ghostCards.length < 2) &&
        groupDragCardIds.length > 0,
      ),
    [ghostCards, groupDragCardIds.length, isGroupDragging],
  );

  return {
    zones,
    cards,
    players,
    libraryRevealsToAll,
    battlefieldViewScale,
    battlefieldGridSizing,
    playerColors,
    gridClass,
    scale,
    myPlayerId,
    slots,
    activeModal,
    setActiveModal,
    overCardScale,
    activeCardId,
    activeCardScale,
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
    isCoinFlipperOpen,
    setIsCoinFlipperOpen,
    isDiceRollerOpen,
    setIsDiceRollerOpen,
    isLogOpen,
    setIsLogOpen,
    isShortcutsOpen,
    setIsShortcutsOpen,
    isShareDialogOpen,
    setIsShareDialogOpen,
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
    handleFlipCoin,
    handleRollDice,
    handleOpenCoinFlipper,
    handleLeave,
    handleCreateNewGame,
    shareLinks,
    shareLinksReady,
    isHost,
    roomLockedByHost,
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
