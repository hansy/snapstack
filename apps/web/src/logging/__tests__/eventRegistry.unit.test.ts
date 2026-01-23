import { describe, expect, it } from "vitest";

import type { Card, Player, Zone } from "@/types";
import type { LogContext, LogEventId } from "../types";

import { logEventRegistry } from "../eventRegistry";

const EVENT_IDS = [
  "player.life",
  "player.commanderTax",
  "coin.flip",
  "dice.roll",
  "card.draw",
  "card.discard",
  "library.shuffle",
  "library.view",
  "library.topReveal",
  "deck.reset",
  "deck.unload",
  "card.move",
  "card.tap",
  "card.untapAll",
  "card.faceUp",
  "card.transform",
  "card.duplicate",
  "card.remove",
  "card.pt",
  "card.tokenCreate",
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

  it("formats coin flip results", () => {
    const ctx: LogContext = {
      players: { p1: makePlayer("p1", "Alice") },
      cards: {},
      zones: {},
    };

    const parts = logEventRegistry["coin.flip"].format(
      { actorId: "p1", count: 2, results: ["heads", "tails"] },
      ctx
    );

    expect(parts.map((p) => p.text).join("")).toBe("Alice flipped 2 coins: [heads, tails]");
  });

  it("formats single coin flip", () => {
    const ctx: LogContext = {
      players: { p1: makePlayer("p1", "Alice") },
      cards: {},
      zones: {},
    };

    const parts = logEventRegistry["coin.flip"].format(
      { actorId: "p1", count: 1, results: ["heads"] },
      ctx
    );

    expect(parts.map((p) => p.text).join("")).toBe("Alice flipped 1 coin: heads");
  });

  it("formats dice roll results", () => {
    const ctx: LogContext = {
      players: { p1: makePlayer("p1", "Alice") },
      cards: {},
      zones: {},
    };

    const parts = logEventRegistry["dice.roll"].format(
      { actorId: "p1", count: 2, sides: 6, results: [3, 5] },
      ctx
    );

    expect(parts.map((p) => p.text).join("")).toBe("Alice rolled 2 6-sided dice: [3, 5]");
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

  it("formats commander tax changes as added/removed", () => {
    const commanderZone = makeZone("cz", "commander", "p1", ["c1"]);
    const commanderCard = makeCard("c1", "Commander", "cz", "p1");
    const ctx: LogContext = {
      players: { p1: makePlayer("p1", "Alice") },
      cards: { c1: commanderCard },
      zones: { cz: commanderZone },
    };

    const added = logEventRegistry["player.commanderTax"].format(
      {
        playerId: "p1",
        from: 0,
        to: 2,
        delta: 2,
        cardId: "c1",
        zoneId: "cz",
        cardName: "Commander",
      },
      ctx
    );

    const removed = logEventRegistry["player.commanderTax"].format(
      {
        playerId: "p1",
        from: 2,
        to: 0,
        delta: -2,
        cardId: "c1",
        zoneId: "cz",
        cardName: "Commander",
      },
      ctx
    );

    expect(added.map((p) => p.text).join("")).toBe(
      "Alice added 2 commander tax to Commander"
    );
    expect(removed.map((p) => p.text).join("")).toBe(
      "Alice removed 2 commander tax from Commander"
    );
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

  it("formats face-up reveals", () => {
    const battlefield = makeZone("bf", "battlefield", "p1", ["c1"]);
    const card = makeCard("c1", "Mystic Snake", "bf", "p1");
    const ctx: LogContext = {
      players: { p1: makePlayer("p1", "Alice") },
      cards: { c1: card },
      zones: { bf: battlefield },
    };

    const parts = logEventRegistry["card.faceUp"].format(
      { actorId: "p1", cardId: "c1", zoneId: "bf", cardName: "Mystic Snake" },
      ctx
    );

    expect(parts.map((p) => p.text).join("")).toBe(
      "Alice revealed Mystic Snake from facedown"
    );
  });

  it("formats transform entries with the provided verb", () => {
    const battlefield = makeZone("bf", "battlefield", "p1", ["c1"]);
    const card = makeCard("c1", "Delver of Secrets", "bf", "p1");
    const ctx: LogContext = {
      players: { p1: makePlayer("p1", "Alice") },
      cards: { c1: card },
      zones: { bf: battlefield },
    };

    const parts = logEventRegistry["card.transform"].format(
      {
        actorId: "p1",
        cardId: "c1",
        zoneId: "bf",
        cardName: "Delver of Secrets",
        toFaceName: "Insectile Aberration",
        verb: "flipped",
      },
      ctx
    );

    expect(parts.map((p) => p.text).join("")).toBe(
      "Alice flipped Delver of Secrets to Insectile Aberration"
    );
  });

  it("formats library view entries", () => {
    const ctx: LogContext = {
      players: { p1: makePlayer("p1", "Alice") },
      cards: {},
      zones: {},
    };

    const withCount = logEventRegistry["library.view"].format(
      { playerId: "p1", count: 3 },
      ctx
    );
    const viewAll = logEventRegistry["library.view"].format({ playerId: "p1" }, ctx);

    expect(withCount.map((p) => p.text).join("")).toBe(
      "Alice viewed top 3 cards of Library"
    );
    expect(viewAll.map((p) => p.text).join("")).toBe("Alice viewed all cards of Library");
  });

  it("formats top card reveal toggles", () => {
    const ctx: LogContext = {
      players: { p1: makePlayer("p1", "Alice") },
      cards: {},
      zones: {},
    };

    const enabled = logEventRegistry["library.topReveal"].format(
      { playerId: "p1", enabled: true, mode: "self" },
      ctx
    );
    const disabled = logEventRegistry["library.topReveal"].format(
      { playerId: "p1", enabled: false, mode: "all" },
      ctx
    );

    expect(enabled.map((p) => p.text).join("")).toBe(
      "Alice toggled ON top card reveal for self"
    );
    expect(disabled.map((p) => p.text).join("")).toBe(
      "Alice toggled OFF top card reveal for everyone"
    );
  });
});
