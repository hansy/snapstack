import { describe, expect, it } from "vitest";

import type { Card } from "@/types";

import { resetCardToFrontFace } from "../cardDisplay";

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

describe("resetCardToFrontFace", () => {
  it("resets currentFaceIndex and syncs stats to face 0", () => {
    const card = makeCard({
      currentFaceIndex: 1,
      scryfall: {
        card_faces: [
          { name: "Front", power: "1", toughness: "2" },
          { name: "Back", power: "3", toughness: "4" },
        ],
      } as any,
    });

    const next = resetCardToFrontFace(card);
    expect(next.currentFaceIndex).toBe(0);
    expect(next.power).toBe("1");
    expect(next.toughness).toBe("2");
    expect(next.basePower).toBe("1");
    expect(next.baseToughness).toBe("2");
  });

  it("still resets the face index even when no faces exist", () => {
    const card = makeCard({
      currentFaceIndex: 2,
      power: "5",
      toughness: "6",
    });

    const next = resetCardToFrontFace(card);
    expect(next.currentFaceIndex).toBe(0);
    expect(next.power).toBe("5");
    expect(next.toughness).toBe("6");
  });
});

