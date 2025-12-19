import { describe, expect, it } from "vitest";

import { ZONE } from "@/constants/zones";

import {
  computeRevealedOpponentLibraryCardIds,
  getLibraryTopCardId,
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
      computeRevealedOpponentLibraryCardIds({
        zone: null,
        cardsById: {},
        viewerId: "me",
      })
    ).toEqual([]);

    expect(
      computeRevealedOpponentLibraryCardIds({
        zone: { id: "z", type: ZONE.HAND, ownerId: "p1", cardIds: ["c1"] } as any,
        cardsById: { c1: { id: "c1" } as any },
        viewerId: "me",
      })
    ).toEqual([]);

    // Viewer is owner => not an opponent reveal.
    expect(
      computeRevealedOpponentLibraryCardIds({
        zone: { id: "z", type: ZONE.LIBRARY, ownerId: "me", cardIds: ["c1"] } as any,
        cardsById: { c1: { id: "c1" } as any },
        viewerId: "me",
      })
    ).toEqual([]);
  });

  it("returns visible cards from top to bottom", () => {
    const zone = { id: "lib", type: ZONE.LIBRARY, ownerId: "p1", cardIds: ["c1", "c2", "c3"] } as any;
    const cardsById = {
      c1: { id: "c1", ownerId: "p1", controllerId: "p1", faceDown: false, knownToAll: true } as any,
      c2: { id: "c2", ownerId: "p1", controllerId: "p1", faceDown: false, knownToAll: false, revealedToAll: true } as any,
      c3: { id: "c3", ownerId: "p1", controllerId: "p1", faceDown: false, knownToAll: false, revealedTo: ["me"] } as any,
    };

    expect(
      computeRevealedOpponentLibraryCardIds({ zone, cardsById, viewerId: "me" })
    ).toEqual(["c3", "c2", "c1"]);
  });

  it("computes the actual top card id", () => {
    expect(getLibraryTopCardId(null)).toBeNull();
    expect(getLibraryTopCardId({ id: "z", type: ZONE.HAND, ownerId: "p1", cardIds: [] } as any)).toBeNull();
    expect(getLibraryTopCardId({ id: "z", type: ZONE.LIBRARY, ownerId: "p1", cardIds: [] } as any)).toBeNull();
    expect(getLibraryTopCardId({ id: "z", type: ZONE.LIBRARY, ownerId: "p1", cardIds: ["c1", "c2"] } as any)).toBe("c2");
  });
});

