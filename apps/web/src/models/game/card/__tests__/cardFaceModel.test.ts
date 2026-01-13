import { describe, expect, it } from "vitest";

import type { Card } from "@/types";
import { ZONE } from "@/constants/zones";

import { createCardFaceModel } from "../cardFaceModel";

const makeCard = (overrides: Partial<Card>): Card =>
  ({
    id: overrides.id ?? "c1",
    name: overrides.name ?? "Card",
    ownerId: overrides.ownerId ?? "p1",
    controllerId: overrides.controllerId ?? overrides.ownerId ?? "p1",
    zoneId: overrides.zoneId ?? "battlefield-p1",
    tapped: overrides.tapped ?? false,
    faceDown: overrides.faceDown ?? false,
    faceDownMode: overrides.faceDownMode,
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

describe("createCardFaceModel", () => {
  it("shows PT only on battlefield and when not hidden", () => {
    const card = makeCard({ power: "2", toughness: "3" });
    const model = createCardFaceModel({
      card,
      zoneType: ZONE.BATTLEFIELD,
      myPlayerId: "p1",
      globalCounters: {},
      revealToNames: [],
    });
    expect(model.showPT).toBe(true);

    const hidden = createCardFaceModel({
      card,
      zoneType: ZONE.BATTLEFIELD,
      hidePT: true,
      myPlayerId: "p1",
      globalCounters: {},
      revealToNames: [],
    });
    expect(hidden.showPT).toBe(false);

    const nonBattlefield = createCardFaceModel({
      card: makeCard({ power: "2", toughness: "3" }),
      zoneType: ZONE.HAND,
      myPlayerId: "p1",
      globalCounters: {},
      revealToNames: [],
    });
    expect(nonBattlefield.showPT).toBe(false);
  });

  it("derives stat color classes from base stats", () => {
    const card = makeCard({ power: "4", toughness: "2", basePower: "3", baseToughness: "3" });
    const model = createCardFaceModel({
      card,
      zoneType: ZONE.BATTLEFIELD,
      myPlayerId: "p1",
      globalCounters: {},
      revealToNames: [],
    });
    expect(model.powerClassName).toBe("text-green-500");
    expect(model.toughnessClassName).toBe("text-red-500");
  });

  it("hides PT for face-down battlefield cards without morph", () => {
    const card = makeCard({ power: "5", toughness: "6", basePower: "1", baseToughness: "1" });
    const model = createCardFaceModel({
      card,
      zoneType: ZONE.BATTLEFIELD,
      faceDown: true,
      myPlayerId: "p1",
      globalCounters: {},
      revealToNames: [],
    });
    expect(model.showPT).toBe(false);
  });

  it("shows morph face-down battlefield stats as 2/2 without color reveals", () => {
    const card = makeCard({
      power: "5",
      toughness: "6",
      basePower: "1",
      baseToughness: "1",
      faceDownMode: "morph",
    });
    const model = createCardFaceModel({
      card,
      zoneType: ZONE.BATTLEFIELD,
      faceDown: true,
      myPlayerId: "p1",
      globalCounters: {},
      revealToNames: [],
    });
    expect(model.showPT).toBe(true);
    expect(model.displayPower).toBe("6");
    expect(model.displayToughness).toBe("7");
    expect(model.powerClassName).toBe("text-green-500");
    expect(model.toughnessClassName).toBe("text-green-500");
  });

  it("shows morph face-down battlefield stats as 2/2 even without base stats", () => {
    const card = makeCard({ power: "3", toughness: "4", faceDownMode: "morph" });
    const model = createCardFaceModel({
      card,
      zoneType: ZONE.BATTLEFIELD,
      faceDown: true,
      myPlayerId: "p1",
      globalCounters: {},
      revealToNames: [],
    });
    expect(model.showPT).toBe(true);
    expect(model.displayPower).toBe("2");
    expect(model.displayToughness).toBe("2");
    expect(model.powerClassName).toBe("text-white");
    expect(model.toughnessClassName).toBe("text-white");
  });

  it("shows name label only on face-up battlefield", () => {
    const base = {
      myPlayerId: "p1",
      globalCounters: {},
      revealToNames: [],
    };

    expect(
      createCardFaceModel({ ...base, card: makeCard({}), zoneType: ZONE.BATTLEFIELD }).showNameLabel
    ).toBe(true);
    expect(
      createCardFaceModel({ ...base, card: makeCard({}), zoneType: ZONE.HAND }).showNameLabel
    ).toBe(false);
    expect(
      createCardFaceModel({
        ...base,
        card: makeCard({}),
        zoneType: ZONE.BATTLEFIELD,
        faceDown: true,
      }).showNameLabel
    ).toBe(false);
  });

  it("only shows reveal icon for the owner when revealed", () => {
    const card = makeCard({ ownerId: "p1", revealedTo: ["p2"] });

    const model = createCardFaceModel({
      card,
      zoneType: ZONE.BATTLEFIELD,
      myPlayerId: "p1",
      globalCounters: {},
      revealToNames: ["Player 2"],
    });
    expect(model.reveal?.toAll).toBe(false);
    expect(model.reveal?.playerNames).toEqual(["Player 2"]);

    const hidden = createCardFaceModel({
      card,
      zoneType: ZONE.BATTLEFIELD,
      myPlayerId: "p2",
      globalCounters: {},
      revealToNames: ["Player 2"],
    });
    expect(hidden.reveal).toBeNull();
  });
});
