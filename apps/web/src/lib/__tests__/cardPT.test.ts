import { describe, expect, it } from "vitest";

import type { Card } from "@/types";

import { getNextCardStatUpdate } from "../cardPT";

const makeCard = (overrides: Partial<Card>): Card =>
  ({
    id: overrides.id ?? "c1",
    name: overrides.name ?? "Card",
    ownerId: overrides.ownerId ?? "p1",
    controllerId: overrides.controllerId ?? overrides.ownerId ?? "p1",
    zoneId: overrides.zoneId ?? "battlefield-p1",
    tapped: overrides.tapped ?? false,
    faceDown: overrides.faceDown ?? false,
    position: overrides.position ?? { x: 0.5, y: 0.5 },
    rotation: overrides.rotation ?? 0,
    counters: overrides.counters ?? [],
    power: overrides.power,
    toughness: overrides.toughness,
    basePower: overrides.basePower,
    baseToughness: overrides.baseToughness,
    currentFaceIndex: overrides.currentFaceIndex,
    revealedToAll: overrides.revealedToAll,
    revealedTo: overrides.revealedTo,
    knownToAll: overrides.knownToAll,
    customText: overrides.customText,
    imageUrl: overrides.imageUrl,
    oracleText: overrides.oracleText,
    typeLine: overrides.typeLine,
    scryfallId: overrides.scryfallId,
    scryfall: overrides.scryfall,
    isToken: overrides.isToken,
  }) as any;

describe("getNextCardStatUpdate", () => {
  it("increments existing power/toughness strings", () => {
    const card = makeCard({ power: "2", toughness: "3" });
    expect(getNextCardStatUpdate(card, "power", 1)).toEqual({ power: "3" });
    expect(getNextCardStatUpdate(card, "toughness", -1)).toEqual({
      toughness: "2",
    });
  });

  it("falls back to face stats when card stat is missing", () => {
    const card = makeCard({
      scryfall: {
        card_faces: [{ power: "1", toughness: "2" }],
      } as any,
      currentFaceIndex: 0,
    });

    expect(getNextCardStatUpdate(card, "power", 2)).toEqual({ power: "3" });
  });

  it("treats * stats as zero so they can be incremented", () => {
    const card = makeCard({ power: "*" });
    expect(getNextCardStatUpdate(card, "power", 1)).toEqual({ power: "1" });
  });
});

