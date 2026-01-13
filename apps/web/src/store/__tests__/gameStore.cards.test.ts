import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { useGameStore } from "../gameStore";
import { ZONE } from "@/constants/zones";
import { ensureLocalStorage } from "../testUtils";

describe("gameStore card actions", () => {
  beforeAll(() => {
    ensureLocalStorage();
  });

  beforeEach(() => {
    localStorage.clear();
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
      playerIdsBySession: {},
      sessionVersions: {},
      hasHydrated: false,
    });
  });

  it("addCard clamps face index, syncs stats, and normalizes legacy positions", () => {
    const battlefield = { id: "bf-me", type: ZONE.BATTLEFIELD, ownerId: "me", cardIds: [] as string[] };

    useGameStore.setState((state) => ({
      ...state,
      zones: { ...state.zones, [battlefield.id]: battlefield },
    }));

    useGameStore.getState().addCard({
      id: "c1",
      name: "Test",
      ownerId: "me",
      controllerId: "me",
      zoneId: battlefield.id,
      tapped: false,
      faceDown: false,
      // Legacy pixel coordinates (should be migrated to normalized)
      position: { x: 100, y: 100 },
      rotation: 0,
      counters: [],
      currentFaceIndex: 5,
      scryfall: {
        id: "s1",
        layout: "transform",
        card_faces: [
          { name: "Front", power: "1", toughness: "2" },
          { name: "Back", power: "3", toughness: "4" },
        ],
      },
    });

    const state = useGameStore.getState();
    const card = state.cards.c1;
    expect(card).toBeTruthy();
    expect(state.zones[battlefield.id]?.cardIds).toEqual(["c1"]);

    expect(card.currentFaceIndex).toBe(1);
    expect(card.power).toBe("3");
    expect(card.toughness).toBe("4");
    expect(card.basePower).toBe("3");
    expect(card.baseToughness).toBe("4");

    expect(card.position.x).toBeCloseTo(0.1, 6);
    expect(card.position.y).toBeCloseTo(100 / 600, 6);
  });

  it("updateCard preserves explicit P/T edits when the face does not change", () => {
    const battlefield = { id: "bf-me", type: ZONE.BATTLEFIELD, ownerId: "me", cardIds: ["c1"] };

    useGameStore.setState((state) => ({
      ...state,
      zones: { ...state.zones, [battlefield.id]: battlefield },
      cards: {
        ...state.cards,
        c1: {
          id: "c1",
          name: "Test",
          ownerId: "me",
          controllerId: "me",
          zoneId: battlefield.id,
          tapped: false,
          faceDown: false,
          position: { x: 0.1, y: 0.2 },
          rotation: 0,
          counters: [],
          currentFaceIndex: 0,
          power: "1",
          toughness: "2",
          basePower: "1",
          baseToughness: "2",
          scryfall: {
            id: "s1",
            layout: "transform",
            card_faces: [
              { name: "Front", power: "1", toughness: "2" },
              { name: "Back", power: "3", toughness: "4" },
            ],
          },
        },
      },
    }));

    useGameStore.getState().updateCard("c1", { power: "9" }, "me");

    const updated = useGameStore.getState().cards.c1;
    expect(updated.power).toBe("9");
    expect(updated.toughness).toBe("2");
    expect(updated.basePower).toBe("1");
    expect(updated.baseToughness).toBe("2");
    expect(updated.currentFaceIndex).toBe(0);
  });

  it("updateCard switching faces syncs P/T from the new face", () => {
    const battlefield = { id: "bf-me", type: ZONE.BATTLEFIELD, ownerId: "me", cardIds: ["c1"] };

    useGameStore.setState((state) => ({
      ...state,
      zones: { ...state.zones, [battlefield.id]: battlefield },
      cards: {
        ...state.cards,
        c1: {
          id: "c1",
          name: "Test",
          ownerId: "me",
          controllerId: "me",
          zoneId: battlefield.id,
          tapped: false,
          faceDown: false,
          position: { x: 0.1, y: 0.2 },
          rotation: 0,
          counters: [],
          currentFaceIndex: 0,
          power: "9",
          toughness: "9",
          basePower: "1",
          baseToughness: "2",
          scryfall: {
            id: "s1",
            layout: "transform",
            card_faces: [
              { name: "Front", power: "1", toughness: "2" },
              { name: "Back", power: "3", toughness: "4" },
            ],
          },
        },
      },
    }));

    useGameStore.getState().updateCard("c1", { currentFaceIndex: 1 }, "me");

    const updated = useGameStore.getState().cards.c1;
    expect(updated.currentFaceIndex).toBe(1);
    expect(updated.power).toBe("3");
    expect(updated.toughness).toBe("4");
    expect(updated.basePower).toBe("3");
    expect(updated.baseToughness).toBe("4");
  });

  it("flipping a face-down battlefield card face-up marks it as known", () => {
    const battlefield = { id: "bf-me", type: ZONE.BATTLEFIELD, ownerId: "me", cardIds: ["c1"] };
    const hand = { id: "hand-me", type: ZONE.HAND, ownerId: "me", cardIds: [] as string[] };

    useGameStore.setState((state) => ({
      ...state,
      zones: { ...state.zones, [battlefield.id]: battlefield, [hand.id]: hand },
      cards: {
        ...state.cards,
        c1: {
          id: "c1",
          name: "Hidden",
          ownerId: "me",
          controllerId: "me",
          zoneId: battlefield.id,
          tapped: false,
          faceDown: true,
          knownToAll: false,
          revealedToAll: false,
          revealedTo: [],
          position: { x: 0.1, y: 0.2 },
          rotation: 0,
          counters: [],
          currentFaceIndex: 0,
        } as any,
      },
    }));

    useGameStore.getState().updateCard("c1", { faceDown: false }, "me");
    expect(useGameStore.getState().cards.c1.faceDown).toBe(false);
    expect(useGameStore.getState().cards.c1.knownToAll).toBe(true);

    useGameStore.getState().moveCard("c1", hand.id, undefined, "me");
    expect(useGameStore.getState().cards.c1.zoneId).toBe(hand.id);
    expect(useGameStore.getState().cards.c1.knownToAll).toBe(true);
  });

  it("clears faceDownMode when setting face-down without a mode", () => {
    const battlefield = { id: "bf-me", type: ZONE.BATTLEFIELD, ownerId: "me", cardIds: ["c1"] };

    useGameStore.setState((state) => ({
      ...state,
      zones: { ...state.zones, [battlefield.id]: battlefield },
      cards: {
        ...state.cards,
        c1: {
          id: "c1",
          name: "Hidden",
          ownerId: "me",
          controllerId: "me",
          zoneId: battlefield.id,
          tapped: false,
          faceDown: true,
          faceDownMode: "morph",
          knownToAll: false,
          revealedToAll: false,
          revealedTo: [],
          position: { x: 0.1, y: 0.2 },
          rotation: 0,
          counters: [],
          currentFaceIndex: 0,
        } as any,
      },
    }));

    useGameStore.getState().updateCard("c1", { faceDown: true }, "me");
    expect(useGameStore.getState().cards.c1.faceDown).toBe(true);
    expect(useGameStore.getState().cards.c1.faceDownMode).toBeUndefined();
  });

  it("flipping a face-up battlefield card face-down clears known/reveal metadata", () => {
    const battlefield = { id: "bf-me", type: ZONE.BATTLEFIELD, ownerId: "me", cardIds: ["c1"] };
    const hand = { id: "hand-me", type: ZONE.HAND, ownerId: "me", cardIds: [] as string[] };

    useGameStore.setState((state) => ({
      ...state,
      zones: { ...state.zones, [battlefield.id]: battlefield, [hand.id]: hand },
      cards: {
        ...state.cards,
        c1: {
          id: "c1",
          name: "Known",
          ownerId: "me",
          controllerId: "me",
          zoneId: battlefield.id,
          tapped: false,
          faceDown: false,
          knownToAll: true,
          revealedToAll: true,
          revealedTo: ["opponent"],
          position: { x: 0.1, y: 0.2 },
          rotation: 0,
          counters: [],
          currentFaceIndex: 0,
        } as any,
      },
    }));

    useGameStore.getState().updateCard("c1", { faceDown: true }, "me");
    expect(useGameStore.getState().cards.c1.faceDown).toBe(true);
    expect(useGameStore.getState().cards.c1.knownToAll).toBe(false);
    expect(useGameStore.getState().cards.c1.revealedToAll).toBe(false);
    expect(useGameStore.getState().cards.c1.revealedTo ?? []).toHaveLength(0);

    useGameStore.getState().moveCard("c1", hand.id, undefined, "me");
    expect(useGameStore.getState().cards.c1.zoneId).toBe(hand.id);
    expect(useGameStore.getState().cards.c1.knownToAll).toBe(false);
  });
});
