import { describe, expect, it, vi } from "vitest";
import { ZONE, ZONE_LABEL } from "@/constants/zones";
import { Card, Player, PlayerId, Zone } from "@/types";
import {
  buildCardActions,
  buildZoneMoveActions,
  buildZoneViewActions,
} from "../menu";

const makeZone = (
  id: string,
  type: (typeof ZONE)[keyof typeof ZONE],
  ownerId: PlayerId
): Zone => ({
  id,
  type,
  ownerId,
  cardIds: [],
});

const baseCard: Card = {
  id: "c1",
  name: "Test",
  ownerId: "p1",
  controllerId: "p1",
  zoneId: "z1",
  tapped: false,
  faceDown: false,
  position: { x: 0, y: 0 },
  rotation: 0,
  counters: [],
};

const makePlayer = (id: PlayerId, name: string): Player => ({
  id,
  name,
  life: 40,
  counters: [],
  commanderDamage: {},
  commanderTax: 0,
});

describe("buildZoneMoveActions", () => {
  it("builds allowed moves between visible zones", () => {
    const current = makeZone("lib", ZONE.LIBRARY, "p1");
    const gy = makeZone("gy", ZONE.GRAVEYARD, "p1");
    const exile = makeZone("exile", ZONE.EXILE, "p1");
    const hand = makeZone("hand", ZONE.HAND, "p1");
    const battlefield = makeZone("bf", ZONE.BATTLEFIELD, "p1");
    const zones = { lib: current, gy, exile, hand, bf: battlefield };

    const actions = buildZoneMoveActions(
      { ...baseCard, zoneId: current.id, ownerId: "p1", controllerId: "p1" },
      current,
      zones,
      "p1",
      vi.fn(),
      vi.fn(),
      undefined,
      undefined,
      "player"
    );

    const labels = actions.map((a) => (a.type === "action" ? a.label : ""));
    expect(labels).toContain(`Move to ${ZONE_LABEL.graveyard}`);
    expect(labels).toContain(`Move to ${ZONE_LABEL.exile}`);
    expect(labels).toContain(`Move to ${ZONE_LABEL.hand}`);
    expect(labels).toContain(`Move to ${ZONE_LABEL.battlefield} (face-up)`);
    expect(labels).toContain(`Move to ${ZONE_LABEL.battlefield} (face-down)`);
    expect(labels).toContain(`Move to bottom of ${ZONE_LABEL.library}`);
    expect(labels).toContain(`Move to top of ${ZONE_LABEL.library}`);
  });

  it("includes bottom-of-library moves for graveyard and exile", () => {
    const library = makeZone("lib", ZONE.LIBRARY, "p1");
    const graveyard = makeZone("gy", ZONE.GRAVEYARD, "p1");
    const exile = makeZone("exile", ZONE.EXILE, "p1");
    const zones = { lib: library, gy: graveyard, exile };

    const graveyardActions = buildZoneMoveActions(
      { ...baseCard, zoneId: graveyard.id, ownerId: "p1", controllerId: "p1" },
      graveyard,
      zones,
      "p1",
      vi.fn(),
      vi.fn(),
      undefined,
      undefined,
      "player"
    );
    const graveyardLabels = graveyardActions.map((a) =>
      a.type === "action" ? a.label : ""
    );
    expect(graveyardLabels).toContain(
      `Move to bottom of ${ZONE_LABEL.library}`
    );
    expect(graveyardLabels).toContain(`Move to top of ${ZONE_LABEL.library}`);

    const exileActions = buildZoneMoveActions(
      { ...baseCard, zoneId: exile.id, ownerId: "p1", controllerId: "p1" },
      exile,
      zones,
      "p1",
      vi.fn(),
      vi.fn(),
      undefined,
      undefined,
      "player"
    );
    const exileLabels = exileActions.map((a) =>
      a.type === "action" ? a.label : ""
    );
    expect(exileLabels).toContain(`Move to bottom of ${ZONE_LABEL.library}`);
    expect(exileLabels).toContain(`Move to top of ${ZONE_LABEL.library}`);
  });

  it("includes reveal submenu for owner in library", () => {
    const current = makeZone("lib", ZONE.LIBRARY, "p1");
    const gy = makeZone("gy", ZONE.GRAVEYARD, "p1");
    const zones = { lib: current, gy };
    const players = {
      p1: makePlayer("p1", "Owner"),
      p2: makePlayer("p2", "Alice"),
      p3: makePlayer("p3", "Bob"),
    };
    const setCardReveal = vi.fn();

    const actions = buildZoneMoveActions(
      {
        ...baseCard,
        zoneId: current.id,
        ownerId: "p1",
        controllerId: "p1",
        revealedToAll: false,
        revealedTo: ["p2"],
      },
      current,
      zones,
      "p1",
      vi.fn(),
      undefined,
      players,
      setCardReveal,
      "player"
    );

    const reveal = actions.find(
      (a): a is Extract<typeof a, { type: "action" }> =>
        a.type === "action" && a.label === "Reveal to ..."
    );
    expect(reveal?.submenu?.length).toBeGreaterThan(0);

    const revealToAll = reveal?.submenu?.find(
      (a): a is Extract<typeof a, { type: "action" }> =>
        a.type === "action" && a.label === "Reveal to all"
    );
    revealToAll?.onSelect();
    expect(setCardReveal).toHaveBeenCalledWith("c1", { toAll: true });

    const alice = reveal?.submenu?.find(
      (a): a is Extract<typeof a, { type: "action" }> =>
        a.type === "action" && a.label === "Alice"
    );
    alice?.onSelect();
    expect(setCardReveal).toHaveBeenCalledWith("c1", { to: [] });

    const hide = reveal?.submenu?.find(
      (a): a is Extract<typeof a, { type: "action" }> =>
        a.type === "action" && a.label === "Hide for all"
    );
    hide?.onSelect();
    expect(setCardReveal).toHaveBeenCalledWith("c1", null);
  });
});

describe("buildZoneViewActions", () => {
  it("disables count prompts when handler missing", () => {
    const zone = makeZone("lib", ZONE.LIBRARY, "owner");
    const items = buildZoneViewActions({
      zone,
      myPlayerId: "owner",
      viewerRole: "player",
      drawCard: vi.fn(),
      discardFromLibrary: vi.fn(),
      shuffleLibrary: vi.fn(),
      resetDeck: vi.fn(),
      mulligan: vi.fn(),
      unloadDeck: vi.fn(),
    });

    const drawMenu = items.find(
      (i): i is Extract<typeof i, { type: "action" }> =>
        i.type === "action" && i.label.includes("Draw ...")
    );
    const drawX = drawMenu?.submenu?.find(
      (i): i is Extract<typeof i, { type: "action" }> =>
        i.type === "action" && i.label.includes("Draw X")
    );
    expect(drawX?.disabledReason).toBeTruthy();

    const discardMenu = items.find(
      (i): i is Extract<typeof i, { type: "action" }> =>
        i.type === "action" && i.label.includes("Discard ...")
    );
    const discardX = discardMenu?.submenu?.find(
      (i): i is Extract<typeof i, { type: "action" }> =>
        i.type === "action" && i.label.includes("Discard X")
    );
    expect(discardX?.disabledReason).toBeTruthy();
  });

  it("enables count prompts when handler provided", () => {
    const zone = makeZone("lib", ZONE.LIBRARY, "owner");
    const openCountPrompt = vi.fn();
    const items = buildZoneViewActions({
      zone,
      myPlayerId: "owner",
      viewerRole: "player",
      drawCard: vi.fn(),
      discardFromLibrary: vi.fn(),
      shuffleLibrary: vi.fn(),
      resetDeck: vi.fn(),
      mulligan: vi.fn(),
      unloadDeck: vi.fn(),
      openCountPrompt,
    });

    const drawMenu = items.find(
      (i): i is Extract<typeof i, { type: "action" }> =>
        i.type === "action" && i.label.includes("Draw ...")
    );
    const drawX = drawMenu?.submenu?.find(
      (i): i is Extract<typeof i, { type: "action" }> =>
        i.type === "action" && i.label.includes("Draw X")
    );
    expect(drawX?.disabledReason).toBeUndefined();

    const discardMenu = items.find(
      (i): i is Extract<typeof i, { type: "action" }> =>
        i.type === "action" && i.label.includes("Discard ...")
    );
    const discardX = discardMenu?.submenu?.find(
      (i): i is Extract<typeof i, { type: "action" }> =>
        i.type === "action" && i.label.includes("Discard X")
    );
    expect(discardX?.disabledReason).toBeUndefined();
  });
});

describe("buildCardActions", () => {
  it("includes tap/untap on battlefield", () => {
    const battlefield = makeZone("bf", ZONE.BATTLEFIELD, "p1");
    const zones = { [battlefield.id]: battlefield };
    const actions = buildCardActions({
      card: { ...baseCard, zoneId: battlefield.id },
      zones,
      myPlayerId: "p1",
      viewerRole: "player",
      moveCard: vi.fn(),
      tapCard: vi.fn(),
      transformCard: vi.fn(),
      duplicateCard: vi.fn(),
      createRelatedCard: vi.fn(),
      addCounter: vi.fn(),
      removeCounter: vi.fn(),
      openAddCounterModal: vi.fn(),
      globalCounters: {},
    });
    expect(
      actions.some((a) => a.type === "action" && a.label === "Tap/Untap")
    ).toBe(true);
  });

  it("creates related submenu items when multiple parts exist", () => {
    const battlefield = makeZone("bf", ZONE.BATTLEFIELD, "p1");
    const zones = { [battlefield.id]: battlefield };
    const actions = buildCardActions({
      card: {
        ...baseCard,
        zoneId: battlefield.id,
        scryfall: {
          all_parts: [
            {
              id: "p1",
              name: "A",
              uri: "u1",
              component: "token",
              object: "related_card",
            },
            {
              id: "p2",
              name: "B",
              uri: "u2",
              component: "token",
              object: "related_card",
            },
          ],
        } as any,
      },
      zones,
      myPlayerId: "p1",
      viewerRole: "player",
      moveCard: vi.fn(),
      tapCard: vi.fn(),
      transformCard: vi.fn(),
      duplicateCard: vi.fn(),
      createRelatedCard: vi.fn(),
      addCounter: vi.fn(),
      removeCounter: vi.fn(),
      openAddCounterModal: vi.fn(),
      globalCounters: {},
    });

    const relatedParent = actions.find(
      (a): a is Extract<typeof a, { type: "action" }> =>
        a.type === "action" && a.label === "Create related"
    );
    expect(relatedParent).toBeDefined();
    expect(relatedParent?.submenu?.length).toBe(2);
  });

  it("includes counter submenus with separator when globals exist", () => {
    const battlefield = makeZone("bf", ZONE.BATTLEFIELD, "p1");
    const zones = { [battlefield.id]: battlefield };
    const actions = buildCardActions({
      card: { ...baseCard, zoneId: battlefield.id },
      zones,
      myPlayerId: "p1",
      viewerRole: "player",
      moveCard: vi.fn(),
      tapCard: vi.fn(),
      transformCard: vi.fn(),
      duplicateCard: vi.fn(),
      createRelatedCard: vi.fn(),
      addCounter: vi.fn(),
      removeCounter: vi.fn(),
      openAddCounterModal: vi.fn(),
      globalCounters: { charge: "#000" },
    });

    const addParent = actions.find(
      (a): a is Extract<typeof a, { type: "action" }> =>
        a.type === "action" && a.label === "Add counter"
    );
    expect(addParent?.submenu?.some((i: any) => i.type === "separator")).toBe(
      true
    );
  });
});
