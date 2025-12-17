export type GameShortcutId =
  | "ui.closeTopmost"
  | "ui.toggleLog"
  | "ui.openTokenModal"
  | "game.untapAll"
  | "game.drawOne"
  | "game.shuffleLibrary"
  | "zone.viewGraveyard"
  | "zone.viewExile"
  | "zone.viewLibraryTop"
  | "game.mulligan"
  | "deck.reset"
  | "deck.unload"
  | "room.leave";

export type GameShortcutBinding = {
  key: string;
  shift?: boolean;
};

export type GameShortcutDefinition = {
  id: GameShortcutId;
  binding: GameShortcutBinding;
  title: string;
  description: string;
  requiresDeckLoaded?: boolean;
};

export const formatShortcutBinding = (binding: GameShortcutBinding) => {
  const key = binding.key.toLowerCase() === "escape" ? "Esc" : binding.key.toUpperCase();
  return binding.shift ? `Shift+${key}` : key;
};

export const GAME_SHORTCUTS: GameShortcutDefinition[] = [
  {
    id: "ui.closeTopmost",
    binding: { key: "escape" },
    title: "Close",
    description: "Closes the topmost open UI (menus, dialogs, viewers).",
    requiresDeckLoaded: false,
  },
  {
    id: "ui.toggleLog",
    binding: { key: "l" },
    title: "Toggle Log",
    description: "Opens/closes the game log drawer.",
    requiresDeckLoaded: false,
  },
  {
    id: "ui.openTokenModal",
    binding: { key: "t" },
    title: "Create Token",
    description: "Opens the token creation modal.",
    requiresDeckLoaded: true,
  },
  {
    id: "game.untapAll",
    binding: { key: "u" },
    title: "Untap All",
    description: "Untaps all permanents you control.",
    requiresDeckLoaded: true,
  },
  {
    id: "game.drawOne",
    binding: { key: "d" },
    title: "Draw 1",
    description: "Draws one card.",
    requiresDeckLoaded: true,
  },
  {
    id: "game.shuffleLibrary",
    binding: { key: "s", shift: true },
    title: "Shuffle",
    description: "Shuffles your library.",
    requiresDeckLoaded: true,
  },
  {
    id: "zone.viewGraveyard",
    binding: { key: "g" },
    title: "View Graveyard",
    description: "Opens your graveyard viewer.",
    requiresDeckLoaded: true,
  },
  {
    id: "zone.viewExile",
    binding: { key: "e" },
    title: "View Exile",
    description: "Opens your exile viewer.",
    requiresDeckLoaded: true,
  },
  {
    id: "zone.viewLibraryTop",
    binding: { key: "v" },
    title: "View Top X",
    description: "Prompts for a number (default 1) and opens the top X cards of your library.",
    requiresDeckLoaded: true,
  },
  {
    id: "game.mulligan",
    binding: { key: "m" },
    title: "Mulligan",
    description: "Prompts for a hand size (default 7), then shuffles and draws that many cards.",
    requiresDeckLoaded: true,
  },
  {
    id: "deck.reset",
    binding: { key: "r", shift: true },
    title: "Reset Deck",
    description: "Resets your deck state (confirm required).",
    requiresDeckLoaded: true,
  },
  {
    id: "deck.unload",
    binding: { key: "u", shift: true },
    title: "Unload Deck",
    description: "Unloads your deck from the game (confirm required).",
    requiresDeckLoaded: true,
  },
  {
    id: "room.leave",
    binding: { key: "q", shift: true },
    title: "Leave Room",
    description: "Leaves the room (confirm required).",
    requiresDeckLoaded: false,
  },
];

