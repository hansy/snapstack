import { describe, expect, it } from "vitest";

import { MAX_REVEALED_TO } from "@/lib/limits";
import { ZONE } from "@/constants/zones";

import { MAX_NAME_LENGTH } from "../sanitizeLimits";
import { sanitizeSharedSnapshot } from "../sanitizeSharedSnapshot";

describe("sanitizeSharedSnapshot", () => {
  it("sanitizes players and truncates names", () => {
    const longName = "x".repeat(MAX_NAME_LENGTH + 10);
    const safe = sanitizeSharedSnapshot({
      players: { p1: { id: "p1", name: longName, life: 40 } },
      zones: {},
      cards: {},
      globalCounters: {},
      playerOrder: [],
    });

    expect(safe.players.p1.name.length).toBeLessThanOrEqual(MAX_NAME_LENGTH);
  });

  it("filters invalid zones and maps legacy command -> commander", () => {
    const safe = sanitizeSharedSnapshot({
      players: { p1: { id: "p1", name: "P1", life: 40 } },
      zones: {
        z1: { id: "z1", ownerId: "p1", type: "command", cardIds: [] },
        z2: { id: "z2", ownerId: "p1", type: "not-a-zone", cardIds: [] },
      },
      cards: {},
      globalCounters: {},
      playerOrder: [],
    });

    expect(Object.keys(safe.zones)).toEqual(["z1"]);
    expect(safe.zones.z1.type).toBe(ZONE.COMMANDER);
  });

  it("drops cards that reference missing zones and filters zone cardIds", () => {
    const safe = sanitizeSharedSnapshot({
      players: { p1: { id: "p1", name: "P1", life: 40 } },
      zones: {
        z1: { id: "z1", ownerId: "p1", type: ZONE.BATTLEFIELD, cardIds: ["c1", "missing"] },
      },
      cards: {
        c1: {
          id: "c1",
          ownerId: "p1",
          controllerId: "p1",
          zoneId: "z1",
          name: "Card",
          tapped: false,
          faceDown: false,
          position: { x: 0.5, y: 0.5 },
          rotation: 0,
          counters: [],
        },
        c2: { id: "c2", ownerId: "p1", controllerId: "p1", zoneId: "missing-zone" },
      },
      globalCounters: {},
      playerOrder: [],
    } as any);

    expect(safe.cards.c2).toBeUndefined();
    expect(safe.zones.z1.cardIds).toEqual(["c1"]);
  });

  it("enforces revealedTo limits and normalizes positions", () => {
    const safe = sanitizeSharedSnapshot({
      players: { p1: { id: "p1", name: "P1", life: 40 } },
      zones: {
        z1: { id: "z1", ownerId: "p1", type: ZONE.BATTLEFIELD, cardIds: ["c1"] },
      },
      cards: {
        c1: {
          id: "c1",
          ownerId: "p1",
          controllerId: "p1",
          zoneId: "z1",
          name: "Card",
          tapped: false,
          faceDown: false,
          position: { x: 2000, y: 2000 },
          rotation: 0,
          counters: [],
          revealedTo: Array.from({ length: MAX_REVEALED_TO + 5 }, (_, i) => `p${i}`),
        },
      },
      globalCounters: {},
      playerOrder: [],
    } as any);

    expect(safe.cards.c1.revealedTo?.length).toBe(MAX_REVEALED_TO);
    expect(safe.cards.c1.position.x).toBeGreaterThanOrEqual(0);
    expect(safe.cards.c1.position.x).toBeLessThanOrEqual(1);
    expect(safe.cards.c1.position.y).toBeGreaterThanOrEqual(0);
    expect(safe.cards.c1.position.y).toBeLessThanOrEqual(1);
  });

  it("strips counters when cards are not on the battlefield", () => {
    const safe = sanitizeSharedSnapshot({
      players: { p1: { id: "p1", name: "P1", life: 40 } },
      zones: {
        yard: { id: "yard", ownerId: "p1", type: ZONE.GRAVEYARD, cardIds: ["c1"] },
      },
      cards: {
        c1: {
          id: "c1",
          ownerId: "p1",
          controllerId: "p1",
          zoneId: "yard",
          name: "Card",
          tapped: false,
          faceDown: false,
          position: { x: 0.5, y: 0.5 },
          rotation: 0,
          counters: [{ type: "+1/+1", count: 2 }],
        },
      },
      globalCounters: {},
      playerOrder: [],
    } as any);

    expect(safe.cards.c1.counters).toEqual([]);
  });

  it("defaults room metadata when absent", () => {
    const safe = sanitizeSharedSnapshot({
      players: { p1: { id: "p1", name: "P1", life: 40 } },
      zones: {},
      cards: {},
      globalCounters: {},
      playerOrder: [],
    });

    expect(safe.roomHostId).toBeNull();
    expect(safe.roomLockedByHost).toBe(false);
  });

  it("hydrates room metadata from snapshot", () => {
    const safe = sanitizeSharedSnapshot({
      players: { p1: { id: "p1", name: "P1", life: 40 } },
      zones: {},
      cards: {},
      globalCounters: {},
      playerOrder: [],
      meta: { hostId: "p1", locked: true },
    });

    expect(safe.roomHostId).toBe("p1");
    expect(safe.roomLockedByHost).toBe(true);
  });

  it("flags rooms that exceed the player cap", () => {
    const players = Array.from({ length: 5 }, (_, index) => [
      `p${index + 1}`,
      { id: `p${index + 1}`, name: `P${index + 1}`, life: 40 },
    ]);

    const safe = sanitizeSharedSnapshot({
      players: Object.fromEntries(players),
      zones: {},
      cards: {},
      globalCounters: {},
      playerOrder: [],
    });

    expect(Object.keys(safe.players).length).toBe(4);
    expect(safe.roomOverCapacity).toBe(true);
  });
});
