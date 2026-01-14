import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { render } from "@testing-library/react";

import { useGameStore } from "@/store/gameStore";
import { ensureLocalStorage } from "@/store/testUtils";
import { useBattlefieldZoomControls } from "@/hooks/game/board/useBattlefieldZoomControls";
import { useGameShortcuts } from "../useGameShortcuts";

const noop = () => {};

const TestHarness = () => {
  useBattlefieldZoomControls({ playerId: "me", enabled: true });

  useGameShortcuts({
    viewerRole: "player",
    myPlayerId: "me",
    zones: {},
    players: useGameStore.getState().players,
    contextMenuOpen: false,
    closeContextMenu: noop,
    countPromptOpen: false,
    closeCountPrompt: noop,
    textPromptOpen: false,
    closeTextPrompt: noop,
    topCardRevealPromptOpen: false,
    closeTopCardRevealPrompt: noop,
    activeModalOpen: false,
    closeActiveModal: noop,
    tokenModalOpen: false,
    setTokenModalOpen: noop,
    coinFlipperOpen: false,
    setCoinFlipperOpen: noop,
    diceRollerOpen: false,
    setDiceRollerOpen: noop,
    loadDeckModalOpen: false,
    setLoadDeckModalOpen: noop,
    shareDialogOpen: false,
    setShareDialogOpen: noop,
    zoneViewerOpen: false,
    closeZoneViewer: noop,
    opponentRevealsOpen: false,
    closeOpponentReveals: noop,
    logOpen: false,
    setLogOpen: noop,
    shortcutsOpen: false,
    setShortcutsOpen: noop,
    openCountPrompt: noop,
    handleViewZone: noop,
    handleLeave: noop,
  });

  return null;
};

describe("useGameShortcuts zoom handling", () => {
  beforeAll(() => {
    ensureLocalStorage();
  });

  beforeEach(() => {
    useGameStore.setState((state) => ({
      ...state,
      players: {
        me: {
          id: "me",
          name: "Me",
          life: 40,
          counters: [],
          commanderDamage: {},
          commanderTax: 0,
          deckLoaded: true,
        },
      },
      battlefieldViewScale: { me: 0.9 },
      myPlayerId: "me",
      viewerRole: "player",
    }));
  });

  it("only applies one zoom step for Shift++ keydown", () => {
    render(<TestHarness />);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "+", shiftKey: true }));

    expect(useGameStore.getState().battlefieldViewScale.me).toBeCloseTo(0.95);
  });
});
