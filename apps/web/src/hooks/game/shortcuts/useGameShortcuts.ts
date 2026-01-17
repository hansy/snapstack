import React from "react";
import { useLatestRef } from "@/hooks/shared/useLatestRef";
import { useGameStore } from "@/store/gameStore";
import type { Player, PlayerId, ViewerRole, Zone, ZoneId } from "@/types";
import { GAME_SHORTCUTS } from "@/models/game/shortcuts/gameShortcuts";
import {
  areShortcutsBlockedByUi,
  closeTopmostUi,
  findShortcutForEvent,
  isDeckLoadedForShortcut,
  isTypingTarget,
  runGameShortcut,
} from "./model";

type CountPromptOptions = {
  title: string;
  message: string;
  onSubmit: (count: number) => void;
  initialValue?: number;
};

export type UseGameShortcutsArgs = {
  viewerRole?: ViewerRole;
  myPlayerId: PlayerId;
  zones: Record<ZoneId, Zone>;
  players: Record<PlayerId, Player>;
  contextMenuOpen: boolean;
  closeContextMenu: () => void;
  countPromptOpen: boolean;
  closeCountPrompt: () => void;
  textPromptOpen: boolean;
  closeTextPrompt: () => void;
  activeModalOpen: boolean;
  closeActiveModal: () => void;
  tokenModalOpen: boolean;
  setTokenModalOpen: (open: boolean) => void;
  coinFlipperOpen: boolean;
  setCoinFlipperOpen: (open: boolean) => void;
  diceRollerOpen: boolean;
  setDiceRollerOpen: (open: boolean) => void;
  loadDeckModalOpen: boolean;
  setLoadDeckModalOpen: (open: boolean) => void;
  shareDialogOpen: boolean;
  setShareDialogOpen: (open: boolean) => void;
  zoneViewerOpen: boolean;
  closeZoneViewer: () => void;
  opponentRevealsOpen: boolean;
  closeOpponentReveals: () => void;
  logOpen: boolean;
  setLogOpen: (open: boolean) => void;
  shortcutsOpen: boolean;
  setShortcutsOpen: (open: boolean) => void;
  openCountPrompt: (opts: CountPromptOptions) => void;
  handleViewZone: (zoneId: ZoneId, count?: number) => void;
  handleLeave: () => void;
};

export const useGameShortcuts = (args: UseGameShortcutsArgs) => {
  const argsRef = useLatestRef(args);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.repeat) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const {
        viewerRole,
        myPlayerId,
        zones,
        players,
        contextMenuOpen,
        closeContextMenu,
        countPromptOpen,
        closeCountPrompt,
        textPromptOpen,
        closeTextPrompt,
        activeModalOpen,
        closeActiveModal,
        tokenModalOpen,
        setTokenModalOpen,
        coinFlipperOpen,
        setCoinFlipperOpen,
        diceRollerOpen,
        setDiceRollerOpen,
        loadDeckModalOpen,
        setLoadDeckModalOpen,
        shareDialogOpen,
        setShareDialogOpen,
        zoneViewerOpen,
        closeZoneViewer,
        opponentRevealsOpen,
        closeOpponentReveals,
        logOpen,
        setLogOpen,
        shortcutsOpen,
        setShortcutsOpen,
        openCountPrompt,
        handleViewZone,
        handleLeave,
      } = argsRef.current;

      const shortcut = findShortcutForEvent(GAME_SHORTCUTS, e);
      if (!shortcut) return;

      const consume = () => {
        e.preventDefault();
        e.stopPropagation();
      };

      if (shortcut.id === "ui.closeTopmost") {
        const closed = closeTopmostUi({
          contextMenuOpen,
          closeContextMenu,
          countPromptOpen,
          closeCountPrompt,
          textPromptOpen,
          closeTextPrompt,
          activeModalOpen,
          closeActiveModal,
          tokenModalOpen,
          setTokenModalOpen,
          coinFlipperOpen,
          setCoinFlipperOpen,
          diceRollerOpen,
          setDiceRollerOpen,
          loadDeckModalOpen,
          setLoadDeckModalOpen,
          shareDialogOpen,
          setShareDialogOpen,
          zoneViewerOpen,
          closeZoneViewer,
          opponentRevealsOpen,
          closeOpponentReveals,
          logOpen,
          setLogOpen,
          shortcutsOpen,
          setShortcutsOpen,
        });
        if (closed) {
          consume();
        }
        return;
      }

      if (
        viewerRole === "spectator" &&
        shortcut.id !== "ui.toggleShortcuts" &&
        shortcut.id !== "ui.toggleLog" &&
        shortcut.id !== "room.leave"
      ) {
        return;
      }

      if (isTypingTarget(e.target)) return;

      if (
        areShortcutsBlockedByUi({
          contextMenuOpen,
          countPromptOpen,
          textPromptOpen,
          activeModalOpen,
          tokenModalOpen,
          coinFlipperOpen,
          diceRollerOpen,
          loadDeckModalOpen,
          shareDialogOpen,
          zoneViewerOpen,
          opponentRevealsOpen,
        })
      )
        return;

      const drawOne = () => useGameStore.getState().drawCard(myPlayerId, myPlayerId);
      const discard = (count = 1) =>
        useGameStore.getState().discardFromLibrary(myPlayerId, count, myPlayerId);
      const shuffle = () => useGameStore.getState().shuffleLibrary(myPlayerId, myPlayerId);
      const resetDeck = () => useGameStore.getState().resetDeck(myPlayerId, myPlayerId);
      const mulligan = (count: number) =>
        useGameStore.getState().mulligan(myPlayerId, count, myPlayerId);
      const unloadDeck = () => useGameStore.getState().unloadDeck(myPlayerId, myPlayerId);
      const untapAll = () => useGameStore.getState().untapAll(myPlayerId);
      const adjustBattlefieldZoom = (direction: "in" | "out") => {
        const currentScale =
          useGameStore.getState().battlefieldViewScale[myPlayerId] ?? 1;
        const delta = 0.05;
        const nextScale =
          direction === "in" ? currentScale + delta : currentScale - delta;
        useGameStore.getState().setBattlefieldViewScale(myPlayerId, nextScale);
      };
      const zoomIn = () => adjustBattlefieldZoom("in");
      const zoomOut = () => adjustBattlefieldZoom("out");

      if (!isDeckLoadedForShortcut(shortcut, players, myPlayerId)) return;

      const handled = runGameShortcut({
        id: shortcut.id,
        myPlayerId,
        zones,
        shortcutsOpen,
        setShortcutsOpen,
        logOpen,
        setLogOpen,
        setTokenModalOpen,
        coinFlipperOpen,
        setCoinFlipperOpen,
        diceRollerOpen,
        setDiceRollerOpen,
        openCountPrompt,
        handleViewZone,
        handleLeave,
        actions: {
          drawOne,
          discard,
          shuffle,
          resetDeck,
          mulligan,
          unloadDeck,
          untapAll,
          zoomIn,
          zoomOut,
        },
      });
      if (handled) consume();
      return;
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, []);
};
