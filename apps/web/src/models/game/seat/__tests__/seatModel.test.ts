import { describe, expect, it } from "vitest";

import { ZONE } from "@/constants/zones";
import type { Card, Zone } from "@/types";

import { createSeatModel } from "../seatModel";

const makeCard = (overrides: Partial<Card>): Card => ({
  id: overrides.id ?? "c",
  name: overrides.name ?? "Card",
  ownerId: overrides.ownerId ?? "p1",
  controllerId: overrides.controllerId ?? overrides.ownerId ?? "p1",
  zoneId: overrides.zoneId ?? "z",
  tapped: overrides.tapped ?? false,
  faceDown: overrides.faceDown ?? false,
  position: overrides.position ?? { x: 0.5, y: 0.5 },
  rotation: overrides.rotation ?? 0,
  counters: overrides.counters ?? [],
  knownToAll: overrides.knownToAll,
  revealedToAll: overrides.revealedToAll,
  revealedTo: overrides.revealedTo,
  currentFaceIndex: overrides.currentFaceIndex,
  power: overrides.power,
  toughness: overrides.toughness,
  basePower: overrides.basePower,
  baseToughness: overrides.baseToughness,
  customText: overrides.customText,
  imageUrl: overrides.imageUrl,
  oracleText: overrides.oracleText,
  typeLine: overrides.typeLine,
  scryfallId: overrides.scryfallId,
  scryfall: overrides.scryfall,
  isToken: overrides.isToken,
});

describe("createSeatModel", () => {
  it.each([
    ["top-left", true],
    ["top-right", true],
    ["bottom-left", false],
    ["bottom-right", false],
  ] as const)(
    "mirrors battlefield Y based on seat position (%s)",
    (position, expected) => {
      const model = createSeatModel({
        playerId: "p1",
        position,
        viewerPlayerId: "p1",
        isMe: false,
        zones: {},
        cards: {},
        scale: 1,
      });

      expect(model.mirrorBattlefieldY).toBe(expected);
    }
  );

  it("never shows opponent library reveal badge for the viewer seat", () => {
    const library: Zone = {
      id: "lib",
      type: ZONE.LIBRARY,
      ownerId: "p1",
      cardIds: [],
    };
    const zones = { lib: library };

    const model = createSeatModel({
      playerId: "p1",
      position: "bottom-left",
      viewerPlayerId: "p1",
      isMe: true,
      zones,
      cards: {},
      scale: 1,
      libraryRevealsToAll: {
        c1: { card: { name: "Card" }, orderKey: "000001", ownerId: "p1" },
      },
    });

    expect(model.opponentLibraryRevealCount).toBe(0);
  });

  it("counts only library reveals for the opponent", () => {
    const library: Zone = {
      id: "lib2",
      type: ZONE.LIBRARY,
      ownerId: "p2",
      cardIds: [],
    };
    const zones = { lib2: library };
    const cards = {
      c1: makeCard({ id: "c1", ownerId: "p2", zoneId: "lib2" }),
      c2: makeCard({ id: "c2", ownerId: "p2", zoneId: "lib2" }),
    };

    const model = createSeatModel({
      playerId: "p2",
      position: "top-right",
      viewerPlayerId: "p1",
      isMe: false,
      zones,
      cards,
      scale: 1,
      libraryRevealsToAll: {
        c1: { card: { name: "One" }, orderKey: "000001", ownerId: "p2" },
        c2: { card: { name: "Two" }, orderKey: "000002", ownerId: "p2" },
        o1: { card: { name: "Other" }, orderKey: "000003", ownerId: "pX" },
      },
    });

    expect(model.cards.library).toHaveLength(2);
    expect(model.opponentLibraryRevealCount).toBe(2);
  });

  it("uses overlay order when library view provides cardIds", () => {
    const library: Zone = {
      id: "lib3",
      type: ZONE.LIBRARY,
      ownerId: "p2",
      cardIds: ["c2", "c1"],
    };
    const zones = { lib3: library };
    const cards = {
      c1: makeCard({ id: "c1", ownerId: "p2", zoneId: "lib3" }),
      c2: makeCard({ id: "c2", ownerId: "p2", zoneId: "lib3" }),
    };

    const model = createSeatModel({
      playerId: "p2",
      position: "top-right",
      viewerPlayerId: "p2",
      isMe: true,
      zones,
      cards,
      scale: 1,
      libraryRevealsToAll: {},
    });

    expect(model.cards.library.map((card) => card.id)).toEqual(["c2", "c1"]);
  });
});
