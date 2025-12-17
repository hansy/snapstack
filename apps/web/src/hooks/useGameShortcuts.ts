import React from "react";
import { getPlayerZones } from "../lib/gameSelectors";
import { useLatestRef } from "./useLatestRef";
import { useGameStore } from "../store/gameStore";
import type { Player, PlayerId, Zone, ZoneId } from "../types";
import { GAME_SHORTCUTS, type GameShortcutBinding, type GameShortcutId } from "../shortcuts/gameShortcuts";

type CountPromptOptions = {
  title: string;
  message: string;
  onSubmit: (count: number) => void;
  initialValue?: number;
};

export type UseGameShortcutsArgs = {
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
  loadDeckModalOpen: boolean;
  setLoadDeckModalOpen: (open: boolean) => void;
  zoneViewerOpen: boolean;
  closeZoneViewer: () => void;
  opponentRevealsOpen: boolean;
  closeOpponentReveals: () => void;
  logOpen: boolean;
  setLogOpen: (open: boolean) => void;
  openCountPrompt: (opts: CountPromptOptions) => void;
  handleViewZone: (zoneId: ZoneId, count?: number) => void;
  handleLeave: () => void;
};

const isTypingTarget = (target: EventTarget | null) => {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName?.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  return Boolean(el.isContentEditable);
};

const matchesBinding = (binding: GameShortcutBinding, e: KeyboardEvent) => {
  const key = e.key.toLowerCase();
  if (key !== binding.key.toLowerCase()) return false;
  if (binding.key.toLowerCase() === "escape") return true;
  return Boolean(binding.shift) === Boolean(e.shiftKey);
};

export const useGameShortcuts = (args: UseGameShortcutsArgs) => {
  const argsRef = useLatestRef(args);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.repeat) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const {
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
        loadDeckModalOpen,
        setLoadDeckModalOpen,
        zoneViewerOpen,
        closeZoneViewer,
        opponentRevealsOpen,
        closeOpponentReveals,
        logOpen,
        setLogOpen,
        openCountPrompt,
        handleViewZone,
        handleLeave,
      } = argsRef.current;

      const shortcut = GAME_SHORTCUTS.find((s) => matchesBinding(s.binding, e));
      if (!shortcut) return;

      const closeTopmostUi = () => {
        if (contextMenuOpen) {
          closeContextMenu();
          return true;
        }
        if (countPromptOpen) {
          closeCountPrompt();
          return true;
        }
        if (textPromptOpen) {
          closeTextPrompt();
          return true;
        }
        if (activeModalOpen) {
          closeActiveModal();
          return true;
        }
        if (tokenModalOpen) {
          setTokenModalOpen(false);
          return true;
        }
        if (loadDeckModalOpen) {
          setLoadDeckModalOpen(false);
          return true;
        }
        if (zoneViewerOpen) {
          closeZoneViewer();
          return true;
        }
        if (opponentRevealsOpen) {
          closeOpponentReveals();
          return true;
        }
        if (logOpen) {
          setLogOpen(false);
          return true;
        }
        return false;
      };

      const consume = () => {
        e.preventDefault();
        e.stopPropagation();
      };

      if (shortcut.id === "ui.closeTopmost") {
        const closed = closeTopmostUi();
        if (closed) {
          consume();
        }
        return;
      }

      if (isTypingTarget(e.target)) return;

      const uiBlocksShortcuts =
        contextMenuOpen ||
        countPromptOpen ||
        textPromptOpen ||
        activeModalOpen ||
        tokenModalOpen ||
        loadDeckModalOpen ||
        zoneViewerOpen ||
        opponentRevealsOpen;
      if (uiBlocksShortcuts) return;

      const me = players?.[myPlayerId];
      const hasDeckLoaded = Boolean(me?.deckLoaded);
      const myZones = getPlayerZones(zones, myPlayerId);

      const drawOne = () => useGameStore.getState().drawCard(myPlayerId, myPlayerId);
      const shuffle = () => useGameStore.getState().shuffleLibrary(myPlayerId, myPlayerId);
      const resetDeck = () => useGameStore.getState().resetDeck(myPlayerId, myPlayerId);
      const unloadDeck = () => useGameStore.getState().unloadDeck(myPlayerId, myPlayerId);
      const untapAll = () => useGameStore.getState().untapAll(myPlayerId);

      const handle = (fn: () => void) => {
        consume();
        fn();
      };

      if (shortcut.requiresDeckLoaded && !hasDeckLoaded) return;

      const run = (id: GameShortcutId): boolean => {
        switch (id) {
          case "ui.toggleLog":
            setLogOpen(!logOpen);
            return true;
          case "ui.openTokenModal":
            setTokenModalOpen(true);
            return true;
          case "game.untapAll":
            untapAll();
            return true;
          case "game.drawOne":
            drawOne();
            return true;
          case "game.shuffleLibrary":
            shuffle();
            return true;
          case "zone.viewGraveyard": {
            const graveyard = myZones.graveyard;
            if (!graveyard) return false;
            handleViewZone(graveyard.id);
            return true;
          }
          case "zone.viewExile": {
            const exile = myZones.exile;
            if (!exile) return false;
            handleViewZone(exile.id);
            return true;
          }
          case "zone.viewLibraryTop": {
            const library = myZones.library;
            if (!library) return false;
            openCountPrompt({
              title: "View Top",
              message: "How many cards from top?",
              initialValue: 1,
              onSubmit: (count) => handleViewZone(library.id, count),
            });
            return true;
          }
          case "game.mulligan":
            openCountPrompt({
              title: "Mulligan",
              message: "Shuffle library and draw new cards. How many cards to draw?",
              initialValue: 7,
              onSubmit: (count) => {
                shuffle();
                for (let i = 0; i < count; i++) drawOne();
              },
            });
            return true;
          case "deck.reset": {
            const ok = window.confirm(
              "Reset deck? This will return all owned cards to your library and reshuffle."
            );
            if (!ok) return true;
            resetDeck();
            return true;
          }
          case "deck.unload": {
            const ok = window.confirm("Unload deck? This removes your deck from the game state.");
            if (!ok) return true;
            unloadDeck();
            return true;
          }
          case "room.leave": {
            const ok = window.confirm("Leave room?");
            if (!ok) return true;
            handleLeave();
            return true;
          }
          case "ui.closeTopmost":
            return false;
          default: {
            const _exhaustive: never = id;
            return _exhaustive;
          }
        }
      };

      const handled = run(shortcut.id);
      if (handled) consume();
      return;
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, []);
};
