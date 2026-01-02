import { getPlayerZones } from "@/lib/gameSelectors";
import type { Player, PlayerId, Zone, ZoneId } from "@/types";
import type {
  GameShortcutBinding,
  GameShortcutDefinition,
  GameShortcutId,
} from "@/models/game/shortcuts/gameShortcuts";

type CountPromptOptions = {
  title: string;
  message: string;
  onSubmit: (count: number) => void;
  initialValue?: number;
  minValue?: number;
  confirmLabel?: string;
};

export const isTypingTarget = (target: EventTarget | null) => {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName?.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  return Boolean(el.isContentEditable);
};

export const matchesBinding = (binding: GameShortcutBinding, e: KeyboardEvent) => {
  const key = e.key.toLowerCase();
  if (key !== binding.key.toLowerCase()) return false;
  if (binding.key.toLowerCase() === "escape") return true;
  return Boolean(binding.shift) === Boolean(e.shiftKey);
};

export const findShortcutForEvent = (
  shortcuts: GameShortcutDefinition[],
  e: KeyboardEvent
): GameShortcutDefinition | undefined => shortcuts.find((s) => matchesBinding(s.binding, e));

export type CloseTopmostUiArgs = {
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
  diceRollerOpen: boolean;
  setDiceRollerOpen: (open: boolean) => void;
  loadDeckModalOpen: boolean;
  setLoadDeckModalOpen: (open: boolean) => void;
  zoneViewerOpen: boolean;
  closeZoneViewer: () => void;
  opponentRevealsOpen: boolean;
  closeOpponentReveals: () => void;
  logOpen: boolean;
  setLogOpen: (open: boolean) => void;
  shortcutsOpen: boolean;
  setShortcutsOpen: (open: boolean) => void;
};

export const closeTopmostUi = (args: CloseTopmostUiArgs): boolean => {
  if (args.contextMenuOpen) {
    args.closeContextMenu();
    return true;
  }
  if (args.countPromptOpen) {
    args.closeCountPrompt();
    return true;
  }
  if (args.textPromptOpen) {
    args.closeTextPrompt();
    return true;
  }
  if (args.activeModalOpen) {
    args.closeActiveModal();
    return true;
  }
  if (args.tokenModalOpen) {
    args.setTokenModalOpen(false);
    return true;
  }
  if (args.diceRollerOpen) {
    args.setDiceRollerOpen(false);
    return true;
  }
  if (args.loadDeckModalOpen) {
    args.setLoadDeckModalOpen(false);
    return true;
  }
  if (args.zoneViewerOpen) {
    args.closeZoneViewer();
    return true;
  }
  if (args.opponentRevealsOpen) {
    args.closeOpponentReveals();
    return true;
  }
  if (args.shortcutsOpen) {
    args.setShortcutsOpen(false);
    return true;
  }
  if (args.logOpen) {
    args.setLogOpen(false);
    return true;
  }
  return false;
};

export const areShortcutsBlockedByUi = (args: {
  contextMenuOpen: boolean;
  countPromptOpen: boolean;
  textPromptOpen: boolean;
  activeModalOpen: boolean;
  tokenModalOpen: boolean;
  diceRollerOpen: boolean;
  loadDeckModalOpen: boolean;
  zoneViewerOpen: boolean;
  opponentRevealsOpen: boolean;
}): boolean => {
  return (
    args.contextMenuOpen ||
    args.countPromptOpen ||
    args.textPromptOpen ||
    args.activeModalOpen ||
    args.tokenModalOpen ||
    args.diceRollerOpen ||
    args.loadDeckModalOpen ||
    args.zoneViewerOpen ||
    args.opponentRevealsOpen
  );
};

export type GameShortcutActions = {
  drawOne: () => void;
  discard: (count?: number) => void;
  shuffle: () => void;
  resetDeck: () => void;
  mulligan: (count: number) => void;
  unloadDeck: () => void;
  untapAll: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
};

export const runGameShortcut = (params: {
  id: GameShortcutId;
  myPlayerId: PlayerId;
  zones: Record<ZoneId, Zone>;
  shortcutsOpen: boolean;
  setShortcutsOpen: (open: boolean) => void;
  logOpen: boolean;
  setLogOpen: (open: boolean) => void;
  setTokenModalOpen: (open: boolean) => void;
  diceRollerOpen: boolean;
  setDiceRollerOpen: (open: boolean) => void;
  openCountPrompt: (opts: CountPromptOptions) => void;
  handleViewZone: (zoneId: ZoneId, count?: number) => void;
  handleLeave: () => void;
  confirm?: (message: string) => boolean;
  actions: GameShortcutActions;
}): boolean => {
  const confirm = params.confirm ?? window.confirm.bind(window);
  const myZones = getPlayerZones(params.zones, params.myPlayerId);

  switch (params.id) {
    case "ui.toggleShortcuts":
      params.setShortcutsOpen(!params.shortcutsOpen);
      return true;
    case "ui.toggleLog":
      params.setLogOpen(!params.logOpen);
      return true;
    case "ui.openTokenModal":
      params.setTokenModalOpen(true);
      return true;
    case "game.untapAll":
      params.actions.untapAll();
      return true;
    case "game.zoomIn":
      params.actions.zoomIn();
      return true;
    case "game.zoomOut":
      params.actions.zoomOut();
      return true;
    case "game.drawOne":
      params.actions.drawOne();
      return true;
    case "game.drawX":
      params.openCountPrompt({
        title: "Draw X",
        message: "How many cards to draw?",
        initialValue: 1,
        onSubmit: (count) => {
          for (let i = 0; i < count; i++) params.actions.drawOne();
        },
      });
      return true;
    case "game.discardOne":
      params.actions.discard(1);
      return true;
    case "game.discardX":
      params.openCountPrompt({
        title: "Discard X",
        message: "How many cards to discard?",
        initialValue: 1,
        minValue: 1,
        onSubmit: (count) => params.actions.discard(count),
      });
      return true;
    case "game.shuffleLibrary":
      params.actions.shuffle();
      return true;
    case "ui.openDiceRoller":
      params.setDiceRollerOpen(true);
      return true;
    case "zone.viewGraveyard": {
      const graveyard = myZones.graveyard;
      if (!graveyard) return false;
      params.handleViewZone(graveyard.id);
      return true;
    }
    case "zone.viewExile": {
      const exile = myZones.exile;
      if (!exile) return false;
      params.handleViewZone(exile.id);
      return true;
    }
    case "zone.viewLibraryAll": {
      const library = myZones.library;
      if (!library) return false;
      params.handleViewZone(library.id);
      return true;
    }
    case "zone.viewLibraryTop": {
      const library = myZones.library;
      if (!library) return false;
      params.openCountPrompt({
        title: "View Top",
        message: "How many cards from top?",
        initialValue: 1,
        onSubmit: (count) => params.handleViewZone(library.id, count),
      });
      return true;
    }
    case "game.mulligan":
      params.openCountPrompt({
        title: "Mulligan",
        message: "Reset deck and draw new cards. How many cards to draw?",
        initialValue: 7,
        onSubmit: (count) => {
          params.actions.mulligan(count);
        },
      });
      return true;
    case "deck.reset": {
      const ok = confirm(
        "Reset deck? This will return all owned cards to your library and reshuffle."
      );
      if (!ok) return true;
      params.actions.resetDeck();
      return true;
    }
    case "deck.unload": {
      const ok = confirm("Unload deck? This removes your deck from the game state.");
      if (!ok) return true;
      params.actions.unloadDeck();
      return true;
    }
    case "room.leave": {
      const ok = confirm("Leave room?");
      if (!ok) return true;
      params.handleLeave();
      return true;
    }
    case "ui.closeTopmost":
      return false;
    default: {
      const _exhaustive: never = params.id;
      return _exhaustive;
    }
  }
};

export const isDeckLoadedForShortcut = (
  shortcut: Pick<GameShortcutDefinition, "requiresDeckLoaded">,
  players: Record<PlayerId, Player>,
  myPlayerId: PlayerId
): boolean => {
  if (!shortcut.requiresDeckLoaded) return true;
  const me = players?.[myPlayerId];
  return Boolean(me?.deckLoaded);
};
