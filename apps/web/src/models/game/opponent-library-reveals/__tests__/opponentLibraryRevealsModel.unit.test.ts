import { describe, expect, it } from "vitest";

import { ZONE } from "@/constants/zones";

import {
  computeRevealedOpponentLibraryCards,
  resolveZoneOwnerName,
} from "../opponentLibraryRevealsModel";

describe("opponentLibraryRevealsModel", () => {
  it("resolves owner name with fallback to id", () => {
    expect(resolveZoneOwnerName({ zone: null, players: {} as any })).toBe("");
    expect(
      resolveZoneOwnerName({
        zone: { ownerId: "p1" } as any,
        players: { p1: { name: "Alice" } } as any,
      })
    ).toBe("Alice");
    expect(
      resolveZoneOwnerName({
        zone: { ownerId: "p1" } as any,
        players: {} as any,
      })
    ).toBe("p1");
  });

  it("returns empty when zone is not an opponent library", () => {
    expect(
      computeRevealedOpponentLibraryCards({
        zone: null,
        cardsById: {},
        viewerId: "me",
        libraryRevealsToAll: {},
      })
    ).toEqual({ cards: [], actualTopCardId: null });

    expect(
      computeRevealedOpponentLibraryCards({
        zone: { id: "z", type: ZONE.HAND, ownerId: "p1", cardIds: [] } as any,
        cardsById: {},
        viewerId: "me",
        libraryRevealsToAll: {},
      })
    ).toEqual({ cards: [], actualTopCardId: null });

    // Viewer is owner => not an opponent reveal.
    expect(
      computeRevealedOpponentLibraryCards({
        zone: { id: "z", type: ZONE.LIBRARY, ownerId: "me", cardIds: [] } as any,
        cardsById: {},
        viewerId: "me",
        libraryRevealsToAll: {},
      })
    ).toEqual({ cards: [], actualTopCardId: null });
  });

  it("returns revealed cards top-first based on order keys", () => {
    const zone = { id: "lib", type: ZONE.LIBRARY, ownerId: "p1", cardIds: [] } as any;
    const libraryRevealsToAll = {
      c1: { card: { name: "Bottom" }, orderKey: "000001", ownerId: "p1" },
      c2: { card: { name: "Top" }, orderKey: "000002", ownerId: "p1" },
    } as any;

    const result = computeRevealedOpponentLibraryCards({
      zone,
      cardsById: {},
      viewerId: "me",
      libraryRevealsToAll,
    });

    expect(result.cards.map((card) => card.id)).toEqual(["c2", "c1"]);
  });

  it("marks the top card when top reveal is set to all", () => {
    const zone = { id: "lib", type: ZONE.LIBRARY, ownerId: "p1", cardIds: [] } as any;
    const libraryRevealsToAll = {
      c1: { card: { name: "Bottom" }, orderKey: "000001", ownerId: "p1" },
      c2: { card: { name: "Top" }, orderKey: "000002", ownerId: "p1" },
    } as any;

    const result = computeRevealedOpponentLibraryCards({
      zone,
      cardsById: {},
      viewerId: "me",
      libraryRevealsToAll,
      libraryTopReveal: "all",
    });

    expect(result.actualTopCardId).toBe("c2");
  });
});
