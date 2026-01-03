import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { ZONE } from "@/constants/zones";
import { createFullSyncToStore } from "@/hooks/game/multiplayer-sync/fullSyncToStore";
import { runGameShortcut } from "@/hooks/game/shortcuts/model";
import { useGameStore } from "@/store/gameStore";
import { ensureLocalStorage } from "@/store/testUtils";
import { acquireSession, destroySession, setActiveSession } from "@/yjs/docManager";
import {
  type SharedMaps,
  upsertCard as yUpsertCard,
  upsertPlayer as yUpsertPlayer,
  upsertZone as yUpsertZone,
} from "@/yjs/yMutations";

const buildSharedMaps = (handles: {
  players: SharedMaps["players"];
  playerOrder: SharedMaps["playerOrder"];
  zones: SharedMaps["zones"];
  cards: SharedMaps["cards"];
  zoneCardOrders: SharedMaps["zoneCardOrders"];
  globalCounters: SharedMaps["globalCounters"];
  battlefieldViewScale: SharedMaps["battlefieldViewScale"];
  meta: SharedMaps["meta"];
}) => ({
  players: handles.players,
  playerOrder: handles.playerOrder,
  zones: handles.zones,
  cards: handles.cards,
  zoneCardOrders: handles.zoneCardOrders,
  globalCounters: handles.globalCounters,
  battlefieldViewScale: handles.battlefieldViewScale,
  meta: handles.meta,
});

describe("mulligan shortcut (shared mode)", () => {
  let sessionId: string | null = null;

  beforeAll(() => {
    ensureLocalStorage();
  });

  beforeEach(() => {
    useGameStore.setState({
      cards: {},
      zones: {},
      players: {},
      myPlayerId: "me",
      viewerRole: "player",
    });
  });

  afterEach(() => {
    if (sessionId) destroySession(sessionId);
    sessionId = null;
    setActiveSession(null);
    vi.unstubAllGlobals();
  });

  it("draws after a reset even when the library starts empty", () => {
    sessionId = "mulligan-shared";
    const handles = acquireSession(sessionId);
    setActiveSession(sessionId);

    const maps: SharedMaps = buildSharedMaps(handles);

    const libraryId = "lib-me";
    const handId = "hand-me";
    const cardIds = Array.from({ length: 10 }, (_, i) => `c${i + 1}`);

    handles.doc.transact(() => {
      yUpsertPlayer(maps, {
        id: "me",
        name: "Me",
        life: 40,
        counters: [],
        commanderDamage: {},
        commanderTax: 0,
        deckLoaded: true,
      });
      yUpsertZone(maps, {
        id: libraryId,
        type: ZONE.LIBRARY,
        ownerId: "me",
        cardIds: [],
      });
      yUpsertZone(maps, {
        id: handId,
        type: ZONE.HAND,
        ownerId: "me",
        cardIds,
      });
      cardIds.forEach((id, index) => {
        yUpsertCard(maps, {
          id,
          ownerId: "me",
          controllerId: "me",
          zoneId: handId,
          name: `Card${index + 1}`,
          tapped: false,
          faceDown: false,
          position: { x: 0, y: 0 },
          rotation: 0,
          counters: [],
        });
      });
    });

    const sync = createFullSyncToStore(maps, (next) => {
      useGameStore.setState(next);
    });
    sync();

    const drawOne = () => useGameStore.getState().drawCard("me", "me");
    const discard = (count?: number) =>
      useGameStore.getState().discardFromLibrary("me", count, "me");
    const shuffle = () => useGameStore.getState().shuffleLibrary("me", "me");
    const resetDeck = () => useGameStore.getState().resetDeck("me", "me");
    const mulligan = (count: number) =>
      useGameStore.getState().mulligan("me", count, "me");
    const unloadDeck = () => useGameStore.getState().unloadDeck("me", "me");
    const untapAll = () => useGameStore.getState().untapAll("me");

    runGameShortcut({
      id: "game.mulligan",
      myPlayerId: "me",
      zones: useGameStore.getState().zones,
      shortcutsOpen: false,
      setShortcutsOpen: vi.fn(),
      logOpen: false,
      setLogOpen: vi.fn(),
      setTokenModalOpen: vi.fn(),
      diceRollerOpen: false,
      setDiceRollerOpen: vi.fn(),
      openCountPrompt: (opts) => opts.onSubmit(7),
      handleViewZone: vi.fn(),
      handleLeave: vi.fn(),
      actions: { drawOne, discard, shuffle, resetDeck, mulligan, unloadDeck, untapAll },
    });

    sync();

    const state = useGameStore.getState();
    expect(state.zones[handId]?.cardIds).toHaveLength(7);
    expect(state.zones[libraryId]?.cardIds).toHaveLength(3);
  });
});
