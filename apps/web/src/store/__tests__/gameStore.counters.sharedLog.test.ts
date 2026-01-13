import { afterEach, describe, expect, it, vi } from "vitest";

type StoreModules = {
  useGameStore: typeof import("../gameStore").useGameStore;
  useLogStore: typeof import("@/logging/logStore").useLogStore;
  ensureLocalStorage: typeof import("../testUtils").ensureLocalStorage;
  ZONE: typeof import("@/constants/zones").ZONE;
};

const setupStore = async (): Promise<StoreModules> => {
  vi.resetModules();
  vi.doMock("@/yjs/docManager", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/yjs/docManager")>();
    return {
      ...actual,
      runWithSharedDoc: () => true,
    };
  });

  const [{ useGameStore }, { useLogStore }, { ensureLocalStorage }, { ZONE }] =
    await Promise.all([
      import("../gameStore"),
      import("@/logging/logStore"),
      import("../testUtils"),
      import("@/constants/zones"),
    ]);

  ensureLocalStorage();
  useLogStore.getState().clear();
  useGameStore.setState({
    players: {},
    playerOrder: [],
    cards: {},
    zones: {},
    battlefieldViewScale: {},
    globalCounters: {},
    activeModal: null,
    sessionId: "s0",
    myPlayerId: "me",
    viewerRole: "player",
    playerIdsBySession: {},
    sessionVersions: {},
    hasHydrated: false,
  });

  return { useGameStore, useLogStore, ensureLocalStorage, ZONE };
};

afterEach(() => {
  vi.doUnmock("@/yjs/docManager");
  vi.resetModules();
  vi.clearAllMocks();
});

describe("gameStore counter logging with shared doc", () => {
  it("logs counter add/remove even when shared doc applies", async () => {
    const { useGameStore, useLogStore, ZONE } = await setupStore();

    const battlefield = {
      id: "bf-me",
      type: ZONE.BATTLEFIELD,
      ownerId: "me",
      cardIds: ["c1"] as string[],
    };
    const card = {
      id: "c1",
      name: "Card",
      ownerId: "me",
      controllerId: "me",
      zoneId: battlefield.id,
      tapped: false,
      faceDown: false,
      position: { x: 0, y: 0 },
      rotation: 0,
      counters: [],
    };

    useGameStore.setState((state) => ({
      ...state,
      zones: { [battlefield.id]: battlefield },
      cards: { [card.id]: card },
    }));

    useGameStore.getState().addCounterToCard(card.id, { type: "+1/+1", count: 1 }, "me");

    // Simulate shared doc updating counters while local state skips the set.
    useGameStore.setState((state) => ({
      ...state,
      cards: {
        ...state.cards,
        [card.id]: {
          ...state.cards[card.id],
          counters: [{ type: "+1/+1", count: 1 }],
        },
      },
    }));

    useGameStore.getState().removeCounterFromCard(card.id, "+1/+1", "me");

    const entries = useLogStore.getState().entries;
    expect(entries).toHaveLength(2);
    expect(entries[0]?.eventId).toBe("counter.add");
    expect(entries[1]?.eventId).toBe("counter.remove");
  });
});
