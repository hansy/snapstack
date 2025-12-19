import { describe, expect, it } from "vitest";

import type { Card, Player, Zone } from "@/types";
import type { LogContext, LogEventId } from "../types";

import { logEventRegistry } from "../eventRegistry";

const EVENT_IDS = [
  "player.life",
  "player.commanderTax",
  "card.draw",
  "library.shuffle",
  "deck.reset",
  "deck.unload",
  "card.move",
  "card.tap",
  "card.untapAll",
  "card.transform",
  "card.duplicate",
  "card.remove",
  "card.pt",
  "counter.add",
  "counter.remove",
  "counter.global.add",
] as const satisfies ReadonlyArray<LogEventId>;

const makePlayer = (id: string, name: string): Player => ({
  id,
  name,
  life: 20,
  counters: [],
  commanderDamage: {},
  commanderTax: 0,
});

const makeZone = (id: string, type: Zone["type"], ownerId: string, cardIds: string[] = []): Zone => ({
  id,
  type,
  ownerId,
  cardIds,
});

const makeCard = (id: string, name: string, zoneId: string, ownerId: string): Card => ({
  id,
  name,
  ownerId,
  controllerId: ownerId,
  zoneId,
  tapped: false,
  faceDown: false,
  position: { x: 0, y: 0 },
  rotation: 0,
  counters: [],
});

describe("logEventRegistry", () => {
  it("exports definitions for all log event ids", () => {
    expect(Object.keys(logEventRegistry).sort()).toEqual([...EVENT_IDS].sort());
  });

  it("formats life changes with signed delta", () => {
    const ctx: LogContext = {
      players: { p1: makePlayer("p1", "Alice") },
      cards: {},
      zones: {},
    };

    const parts = logEventRegistry["player.life"].format(
      { playerId: "p1", from: 20, to: 18, delta: -2 },
      ctx
    );

    expect(parts.map((p) => p.text).join("")).toBe("Alice life -2 (20 -> 18)");
  });

  it("formats card moves to battlefield as played-from", () => {
    const hand = makeZone("hand", "hand", "p1", ["c1"]);
    const battlefield = makeZone("bf", "battlefield", "p1", []);
    const card = makeCard("c1", "Lightning Bolt", "hand", "p1");

    const ctx: LogContext = {
      players: { p1: makePlayer("p1", "Alice") },
      cards: { c1: card },
      zones: { hand, bf: battlefield },
    };

    const parts = logEventRegistry["card.move"].format(
      { actorId: "p1", cardId: "c1", fromZoneId: "hand", toZoneId: "bf" },
      ctx
    );

    expect(parts.map((p) => p.text).join("")).toBe("Alice played Lightning Bolt from Hand");
  });

  it("formats gains-control moves using the new controller", () => {
    const battlefield = makeZone("bf", "battlefield", "p1", ["c1"]);
    const card = makeCard("c1", "Lightning Bolt", "bf", "p1");

    const ctx: LogContext = {
      players: { p1: makePlayer("p1", "Alice"), p2: makePlayer("p2", "Bob") },
      cards: { c1: card },
      zones: { bf: battlefield, x: makeZone("x", "battlefield", "p2") },
    };

    const parts = logEventRegistry["card.move"].format(
      {
        actorId: "p1",
        gainsControlBy: "p2",
        cardId: "c1",
        fromZoneId: "bf",
        toZoneId: "x",
      },
      ctx
    );

    expect(parts.map((p) => p.text).join("")).toBe("Bob gains control of Lightning Bolt");
  });
});

