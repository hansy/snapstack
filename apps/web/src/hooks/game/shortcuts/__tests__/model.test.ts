import { describe, expect, it, vi } from "vitest";

import { ZONE } from "@/constants/zones";

import {
  areShortcutsBlockedByUi,
  closeTopmostUi,
  isDeckLoadedForShortcut,
  runGameShortcut,
} from "../model";

describe("gameShortcuts/model", () => {
  it("closes the topmost UI in priority order", () => {
    const closeContextMenu = vi.fn();
    const closeCountPrompt = vi.fn();

    const closed = closeTopmostUi({
      contextMenuOpen: true,
      closeContextMenu,
      countPromptOpen: true,
      closeCountPrompt,
      textPromptOpen: false,
      closeTextPrompt: vi.fn(),
      activeModalOpen: false,
      closeActiveModal: vi.fn(),
      tokenModalOpen: false,
      setTokenModalOpen: vi.fn(),
      diceRollerOpen: false,
      setDiceRollerOpen: vi.fn(),
      loadDeckModalOpen: false,
      setLoadDeckModalOpen: vi.fn(),
      zoneViewerOpen: false,
      closeZoneViewer: vi.fn(),
      opponentRevealsOpen: false,
      closeOpponentReveals: vi.fn(),
      logOpen: false,
      setLogOpen: vi.fn(),
      shortcutsOpen: false,
      setShortcutsOpen: vi.fn(),
    });

    expect(closed).toBe(true);
    expect(closeContextMenu).toHaveBeenCalledTimes(1);
    expect(closeCountPrompt).toHaveBeenCalledTimes(0);
  });

  it("reports when shortcuts are blocked by open UI", () => {
    expect(
      areShortcutsBlockedByUi({
        contextMenuOpen: false,
        countPromptOpen: false,
        textPromptOpen: false,
        activeModalOpen: false,
        tokenModalOpen: false,
        diceRollerOpen: false,
        loadDeckModalOpen: false,
        zoneViewerOpen: false,
        opponentRevealsOpen: false,
      })
    ).toBe(false);

    expect(
      areShortcutsBlockedByUi({
        contextMenuOpen: true,
        countPromptOpen: false,
        textPromptOpen: false,
        activeModalOpen: false,
        tokenModalOpen: false,
        diceRollerOpen: false,
        loadDeckModalOpen: false,
        zoneViewerOpen: false,
        opponentRevealsOpen: false,
      })
    ).toBe(true);
  });

  it("runs deck reset only when confirmed", () => {
    const actions = {
      drawOne: vi.fn(),
      shuffle: vi.fn(),
      resetDeck: vi.fn(),
      unloadDeck: vi.fn(),
      untapAll: vi.fn(),
    };

    const base = {
      id: "deck.reset" as const,
      myPlayerId: "me",
      zones: {
        lib: { id: "lib", ownerId: "me", type: ZONE.LIBRARY, cardIds: [] },
      } as any,
      shortcutsOpen: false,
      setShortcutsOpen: vi.fn(),
      logOpen: false,
      setLogOpen: vi.fn(),
      setTokenModalOpen: vi.fn(),
      diceRollerOpen: false,
      setDiceRollerOpen: vi.fn(),
      openCountPrompt: vi.fn(),
      handleViewZone: vi.fn(),
      handleLeave: vi.fn(),
      actions,
    };

    expect(runGameShortcut({ ...base, confirm: () => false })).toBe(true);
    expect(actions.resetDeck).toHaveBeenCalledTimes(0);

    expect(runGameShortcut({ ...base, confirm: () => true })).toBe(true);
    expect(actions.resetDeck).toHaveBeenCalledTimes(1);
  });

  it("does not handle view-top when no library exists", () => {
    const handled = runGameShortcut({
      id: "zone.viewLibraryTop",
      myPlayerId: "me",
      zones: {},
      shortcutsOpen: false,
      setShortcutsOpen: vi.fn(),
      logOpen: false,
      setLogOpen: vi.fn(),
      setTokenModalOpen: vi.fn(),
      diceRollerOpen: false,
      setDiceRollerOpen: vi.fn(),
      openCountPrompt: vi.fn(),
      handleViewZone: vi.fn(),
      handleLeave: vi.fn(),
      actions: {
        drawOne: vi.fn(),
        shuffle: vi.fn(),
        resetDeck: vi.fn(),
        unloadDeck: vi.fn(),
        untapAll: vi.fn(),
      },
    });

    expect(handled).toBe(false);
  });

  it("checks deck-loaded requirements", () => {
    expect(isDeckLoadedForShortcut({ requiresDeckLoaded: false }, {} as any, "me")).toBe(true);
    expect(
      isDeckLoadedForShortcut(
        { requiresDeckLoaded: true },
        { me: { deckLoaded: false } as any } as any,
        "me"
      )
    ).toBe(false);
    expect(
      isDeckLoadedForShortcut(
        { requiresDeckLoaded: true },
        { me: { deckLoaded: true } as any } as any,
        "me"
      )
    ).toBe(true);
  });
});
