import { describe, expect, it } from "vitest";

import { ZONE } from "@/constants/zones";
import type { GameState } from "@/types";
import { mergePrivateOverlay } from "@/store/gameStore/overlay";
import { createPrivateOverlayActions } from "@/store/gameStore/actions/privateOverlay";
import { resetIntentState, setAuthoritativeState } from "@/store/gameStore/dispatchIntent";

const buildBaseState = (): GameState =>
  ({
    viewerRole: "player",
    players: {
      p1: {
        id: "p1",
        name: "P1",
        life: 40,
        counters: [],
        commanderDamage: {},
        commanderTax: 0,
      },
    },
    playerOrder: ["p1"],
    cards: {},
    zones: {
      hand: { id: "hand", type: ZONE.HAND, ownerId: "p1", cardIds: ["c1", "c2"] },
      lib: { id: "lib", type: ZONE.LIBRARY, ownerId: "p1", cardIds: [] },
    },
    handRevealsToAll: {},
    libraryRevealsToAll: {},
    faceDownRevealsToAll: {},
    battlefieldViewScale: {},
    roomHostId: null,
    roomLockedByHost: false,
    roomOverCapacity: false,
    privateOverlay: null,
    roomTokens: null,
    sessionId: "s",
    myPlayerId: "p1",
    positionFormat: "normalized",
    globalCounters: {},
    activeModal: null,
    addPlayer: (() => {}) as any,
    updatePlayer: (() => {}) as any,
    addZone: (() => {}) as any,
    addCard: (() => {}) as any,
    addCards: (() => {}) as any,
    updateCard: (() => {}) as any,
    transformCard: (() => {}) as any,
    moveCard: (() => {}) as any,
    moveCardToBottom: (() => {}) as any,
    duplicateCard: (() => {}) as any,
    reorderZoneCards: (() => {}) as any,
    removeCard: (() => {}) as any,
    tapCard: (() => {}) as any,
    untapAll: (() => {}) as any,
    drawCard: (() => {}) as any,
    discardFromLibrary: (() => {}) as any,
    shuffleLibrary: (() => {}) as any,
    mulligan: (() => {}) as any,
    setCardReveal: (() => {}) as any,
    resetDeck: (() => {}) as any,
    unloadDeck: (() => {}) as any,
    setDeckLoaded: (() => {}) as any,
    setRoomLockedByHost: (() => {}) as any,
    addGlobalCounter: (() => {}) as any,
    addCounterToCard: (() => {}) as any,
    removeCounterFromCard: (() => {}) as any,
    setActiveModal: (() => {}) as any,
    playerIdsBySession: {},
    sessionVersions: {},
    resetSession: (() => {}) as any,
    ensurePlayerIdForSession: (() => "p1") as any,
    forgetSessionIdentity: (() => {}) as any,
    ensureSessionVersion: (() => 1) as any,
    leaveGame: (() => {}) as any,
    setBattlefieldViewScale: (() => {}) as any,
    setViewerRole: (() => {}) as any,
    applyPrivateOverlay: (() => {}) as any,
    setRoomTokens: (() => {}) as any,
    hasHydrated: false,
    setHasHydrated: (() => {}) as any,
  }) as GameState;

describe("mergePrivateOverlay", () => {
  it("creates placeholders for hand cards", () => {
    const base = buildBaseState();
    const merged = mergePrivateOverlay(base, { cards: [] });

    expect(merged.cards.c1?.name).toBe("Card");
    expect(merged.cards.c2?.name).toBe("Card");
    expect(merged.cards.c1?.zoneId).toBe("hand");
  });

  it("applies public hand reveals", () => {
    const base = buildBaseState();
    base.handRevealsToAll = { c2: { name: "Revealed" } };

    const merged = mergePrivateOverlay(base, { cards: [] });

    expect(merged.cards.c2?.name).toBe("Revealed");
    expect(merged.cards.c2?.revealedToAll).toBe(true);
  });

  it("applies public face-down reveals", () => {
    const base = buildBaseState();
    base.zones.bf = { id: "bf", type: ZONE.BATTLEFIELD, ownerId: "p1", cardIds: ["fd1"] };
    base.cards = {
      fd1: {
        id: "fd1",
        name: "Card",
        ownerId: "p1",
        controllerId: "p1",
        zoneId: "bf",
        tapped: false,
        faceDown: true,
        position: { x: 0.5, y: 0.5 },
        rotation: 0,
        counters: [],
      },
    } as any;
    base.faceDownRevealsToAll = { fd1: { name: "Hidden" } };

    const merged = mergePrivateOverlay(base, { cards: [] });

    expect(merged.cards.fd1?.name).toBe("Hidden");
    expect(merged.cards.fd1?.revealedToAll).toBe(true);
  });

  it("overlays cards and zone card orders", () => {
    const base = buildBaseState();
    const merged = mergePrivateOverlay(base, {
      cards: [
        {
          id: "c1",
          name: "Actual",
          ownerId: "p1",
          controllerId: "p1",
          zoneId: "hand",
          tapped: false,
          faceDown: false,
          position: { x: 0.5, y: 0.5 },
          rotation: 0,
          counters: [],
        },
      ],
      zoneCardOrders: { lib: ["c3", "c4"] },
    });

    expect(merged.cards.c1?.name).toBe("Actual");
    expect(merged.zones.lib?.cardIds).toEqual(["c3", "c4"]);
  });

  it("preserves public-zone state when overlay includes battlefield cards", () => {
    const base = buildBaseState();
    base.zones.bf = {
      id: "bf",
      type: ZONE.BATTLEFIELD,
      ownerId: "p1",
      cardIds: ["c1"],
    } as any;
    base.cards = {
      c1: {
        id: "c1",
        name: "Base",
        ownerId: "p1",
        controllerId: "p1",
        zoneId: "bf",
        tapped: true,
        faceDown: true,
        faceDownMode: "manifest",
        position: { x: 0.42, y: 0.61 },
        rotation: 90,
        counters: [],
        knownToAll: false,
        revealedToAll: false,
        revealedTo: [],
        currentFaceIndex: 0,
      },
    } as any;

    const merged = mergePrivateOverlay(base, {
      cards: [
        {
          id: "c1",
          name: "Overlay",
          ownerId: "p1",
          controllerId: "p1",
          zoneId: "bf",
          tapped: false,
          faceDown: false,
          faceDownMode: "morph",
          position: { x: 0.1, y: 0.2 },
          rotation: 0,
          counters: [],
          knownToAll: true,
          revealedToAll: true,
          revealedTo: ["p1"],
          currentFaceIndex: 1,
        },
      ],
    });

    expect(merged.cards.c1?.name).toBe("Overlay");
    expect(merged.cards.c1?.position).toEqual({ x: 0.42, y: 0.61 });
    expect(merged.cards.c1?.tapped).toBe(true);
    expect(merged.cards.c1?.faceDown).toBe(true);
    expect(merged.cards.c1?.faceDownMode).toBe("manifest");
    expect(merged.cards.c1?.rotation).toBe(90);
    expect(merged.cards.c1?.currentFaceIndex).toBe(0);
    expect(merged.cards.c1?.knownToAll).toBe(false);
    expect(merged.cards.c1?.revealedToAll).toBe(false);
    expect(merged.cards.c1?.revealedTo).toEqual([]);
  });
});

describe("applyPrivateOverlay", () => {
  it("rebuilds from the public snapshot before applying overlays", () => {
    resetIntentState();

    const basePublic = buildBaseState();
    basePublic.zones.bf = {
      id: "bf",
      type: ZONE.BATTLEFIELD,
      ownerId: "p1",
      cardIds: [],
    } as any;
    basePublic.cards = {};

    const overlay = {
      cards: [
        {
          id: "c1",
          name: "Secret",
          ownerId: "p1",
          controllerId: "p1",
          zoneId: "hand",
          tapped: false,
          faceDown: false,
          position: { x: 0.5, y: 0.5 },
          rotation: 0,
          counters: [],
        },
      ],
    };

    let state = {
      ...basePublic,
      zones: {
        ...basePublic.zones,
        bf: {
          id: "bf",
          type: ZONE.BATTLEFIELD,
          ownerId: "p1",
          cardIds: ["ghost"],
        },
      },
      cards: {
        ghost: {
          id: "ghost",
          name: "Ghost",
          ownerId: "p1",
          controllerId: "p1",
          zoneId: "bf",
          tapped: false,
          faceDown: false,
          position: { x: 0.5, y: 0.5 },
          rotation: 0,
          counters: [],
        },
      },
    } as GameState;

    const set = (next: any) => {
      state = typeof next === "function" ? next(state) : { ...state, ...next };
    };
    const get = () => state;

    setAuthoritativeState(basePublic as any, basePublic as any);

    const { applyPrivateOverlay } = createPrivateOverlayActions(set as any, get as any);
    applyPrivateOverlay(overlay as any);

    expect(state.cards.ghost).toBeUndefined();
    expect(state.cards.c1?.name).toBe("Secret");
  });
});
