import React from "react";
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useGameShortcuts, type UseGameShortcutsArgs } from "./useGameShortcuts";
import { useGameStore } from "../store/gameStore";
import { ZONE } from "../constants/zones";
import type { Player, Zone } from "../types";

const createPlayer = (id: string, deckLoaded: boolean): Player =>
  ({
    id,
    name: id,
    life: 40,
    counters: [],
    commanderDamage: {},
    commanderTax: 0,
    deckLoaded,
  }) as any;

const createZone = (id: string, ownerId: string, type: string): Zone =>
  ({
    id,
    ownerId,
    type,
    name: id,
    cardIds: [],
    isPublic: true,
  }) as any;

const resetStore = (overrides?: Partial<ReturnType<typeof useGameStore.getState>>) => {
  useGameStore.setState((state: any) => ({
    ...state,
    players: {},
    zones: {},
    ...overrides,
  }));
};

const Probe: React.FC<{ args: UseGameShortcutsArgs }> = ({ args }) => {
  useGameShortcuts(args);
  return null;
};

describe("useGameShortcuts", () => {
  beforeEach(() => {
    resetStore();
  });

  it("does not run non-Esc shortcuts while typing", () => {
    const drawCard = vi.fn();
    resetStore({ drawCard } as any);

    const input = document.createElement("input");
    document.body.appendChild(input);

    const args: UseGameShortcutsArgs = {
      myPlayerId: "me" as any,
      zones: {
        "lib-me": createZone("lib-me", "me", ZONE.LIBRARY),
        "hand-me": createZone("hand-me", "me", ZONE.HAND),
      } as any,
      players: { me: createPlayer("me", true) } as any,
      contextMenuOpen: false,
      closeContextMenu: vi.fn(),
      countPromptOpen: false,
      closeCountPrompt: vi.fn(),
      textPromptOpen: false,
      closeTextPrompt: vi.fn(),
      activeModalOpen: false,
      closeActiveModal: vi.fn(),
      tokenModalOpen: false,
      setTokenModalOpen: vi.fn(),
      loadDeckModalOpen: false,
      setLoadDeckModalOpen: vi.fn(),
      zoneViewerOpen: false,
      closeZoneViewer: vi.fn(),
      opponentRevealsOpen: false,
      closeOpponentReveals: vi.fn(),
      logOpen: false,
      setLogOpen: vi.fn(),
      openCountPrompt: vi.fn(),
      handleViewZone: vi.fn(),
      handleLeave: vi.fn(),
    };

    render(<Probe args={args} />);

    input.dispatchEvent(new KeyboardEvent("keydown", { key: "d", bubbles: true }));
    expect(drawCard).not.toHaveBeenCalled();
  });

  it("closes topmost UI on Escape even when typing", () => {
    const closeContextMenu = vi.fn();
    const input = document.createElement("input");
    document.body.appendChild(input);

    const args: UseGameShortcutsArgs = {
      myPlayerId: "me" as any,
      zones: {} as any,
      players: {} as any,
      contextMenuOpen: true,
      closeContextMenu,
      countPromptOpen: false,
      closeCountPrompt: vi.fn(),
      textPromptOpen: false,
      closeTextPrompt: vi.fn(),
      activeModalOpen: false,
      closeActiveModal: vi.fn(),
      tokenModalOpen: false,
      setTokenModalOpen: vi.fn(),
      loadDeckModalOpen: false,
      setLoadDeckModalOpen: vi.fn(),
      zoneViewerOpen: false,
      closeZoneViewer: vi.fn(),
      opponentRevealsOpen: false,
      closeOpponentReveals: vi.fn(),
      logOpen: false,
      setLogOpen: vi.fn(),
      openCountPrompt: vi.fn(),
      handleViewZone: vi.fn(),
      handleLeave: vi.fn(),
    };

    render(<Probe args={args} />);

    const evt = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, shiftKey: true });
    input.dispatchEvent(evt);
    expect(closeContextMenu).toHaveBeenCalledTimes(1);
  });

  it("invokes openCountPrompt with initialValue=1 on V", () => {
    const openCountPrompt = vi.fn();
    const zones = {
      "lib-me": createZone("lib-me", "me", ZONE.LIBRARY),
    } as any;

    const args: UseGameShortcutsArgs = {
      myPlayerId: "me" as any,
      zones,
      players: { me: createPlayer("me", true) } as any,
      contextMenuOpen: false,
      closeContextMenu: vi.fn(),
      countPromptOpen: false,
      closeCountPrompt: vi.fn(),
      textPromptOpen: false,
      closeTextPrompt: vi.fn(),
      activeModalOpen: false,
      closeActiveModal: vi.fn(),
      tokenModalOpen: false,
      setTokenModalOpen: vi.fn(),
      loadDeckModalOpen: false,
      setLoadDeckModalOpen: vi.fn(),
      zoneViewerOpen: false,
      closeZoneViewer: vi.fn(),
      opponentRevealsOpen: false,
      closeOpponentReveals: vi.fn(),
      logOpen: false,
      setLogOpen: vi.fn(),
      openCountPrompt,
      handleViewZone: vi.fn(),
      handleLeave: vi.fn(),
    };

    render(<Probe args={args} />);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "v", bubbles: true }));
    expect(openCountPrompt).toHaveBeenCalledTimes(1);
    expect(openCountPrompt.mock.calls[0][0].initialValue).toBe(1);
  });

  it("does not prevent default for a matched shortcut that becomes a no-op", () => {
    const openCountPrompt = vi.fn();
    const args: UseGameShortcutsArgs = {
      myPlayerId: "me" as any,
      zones: {} as any,
      players: { me: createPlayer("me", true) } as any,
      contextMenuOpen: false,
      closeContextMenu: vi.fn(),
      countPromptOpen: false,
      closeCountPrompt: vi.fn(),
      textPromptOpen: false,
      closeTextPrompt: vi.fn(),
      activeModalOpen: false,
      closeActiveModal: vi.fn(),
      tokenModalOpen: false,
      setTokenModalOpen: vi.fn(),
      loadDeckModalOpen: false,
      setLoadDeckModalOpen: vi.fn(),
      zoneViewerOpen: false,
      closeZoneViewer: vi.fn(),
      opponentRevealsOpen: false,
      closeOpponentReveals: vi.fn(),
      logOpen: false,
      setLogOpen: vi.fn(),
      openCountPrompt,
      handleViewZone: vi.fn(),
      handleLeave: vi.fn(),
    };

    render(<Probe args={args} />);

    const evt = new KeyboardEvent("keydown", { key: "v", bubbles: true, cancelable: true });
    window.dispatchEvent(evt);
    expect(openCountPrompt).not.toHaveBeenCalled();
    expect(evt.defaultPrevented).toBe(false);
  });

  it("allows L even when deck is not loaded", () => {
    const setLogOpen = vi.fn();

    const args: UseGameShortcutsArgs = {
      myPlayerId: "me" as any,
      zones: {} as any,
      players: { me: createPlayer("me", false) } as any,
      contextMenuOpen: false,
      closeContextMenu: vi.fn(),
      countPromptOpen: false,
      closeCountPrompt: vi.fn(),
      textPromptOpen: false,
      closeTextPrompt: vi.fn(),
      activeModalOpen: false,
      closeActiveModal: vi.fn(),
      tokenModalOpen: false,
      setTokenModalOpen: vi.fn(),
      loadDeckModalOpen: false,
      setLoadDeckModalOpen: vi.fn(),
      zoneViewerOpen: false,
      closeZoneViewer: vi.fn(),
      opponentRevealsOpen: false,
      closeOpponentReveals: vi.fn(),
      logOpen: false,
      setLogOpen,
      openCountPrompt: vi.fn(),
      handleViewZone: vi.fn(),
      handleLeave: vi.fn(),
    };

    render(<Probe args={args} />);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "l", bubbles: true }));
    expect(setLogOpen).toHaveBeenCalledWith(true);
  });
});
