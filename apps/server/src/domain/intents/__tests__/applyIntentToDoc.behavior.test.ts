import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import type { Card } from "../../../../../web/src/types/cards";
import type { Player } from "../../../../../web/src/types/players";
import type { Zone } from "../../../../../web/src/types/zones";
import { ZONE } from "../../constants";
import { createEmptyHiddenState } from "../../hiddenState";
import { applyIntentToDoc } from "../applyIntentToDoc";
import {
  getMaps,
  readPlayer,
  readZone,
  writeCard,
  writePlayer,
  writeZone,
} from "../../yjsStore";

const createDoc = () => new Y.Doc();

const makePlayer = (id: string, overrides: Partial<Player> = {}): Player => ({
  id,
  name: `Player ${id}`,
  life: 20,
  counters: [],
  commanderDamage: {},
  commanderTax: 0,
  ...overrides,
});

const makeZone = (
  id: string,
  type: Zone["type"],
  ownerId: string,
  cardIds: string[] = []
): Zone => ({
  id,
  type,
  ownerId,
  cardIds,
});

const makeCard = (
  id: string,
  ownerId: string,
  zoneId: string,
  overrides: Partial<Card> = {}
): Card => ({
  id,
  name: `Card ${id}`,
  ownerId,
  controllerId: ownerId,
  zoneId,
  tapped: false,
  faceDown: false,
  position: { x: 0.5, y: 0.5 },
  rotation: 0,
  counters: [],
  ...overrides,
});

describe("applyIntentToDoc", () => {
  it("should reject player joins when the room is locked", () => {
    const doc = createDoc();
    const maps = getMaps(doc);
    maps.meta.set("locked", true);
    const hidden = createEmptyHiddenState();

    const result = applyIntentToDoc(doc, {
      id: "intent-1",
      type: "player.join",
      payload: { actorId: "p1", player: makePlayer("p1") },
    }, hidden);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("room locked");
    }
    expect(maps.players.size).toBe(0);
    expect(hidden.handOrder.p1).toBeUndefined();
  });

  it("should set the host and initialize hidden orders for a new player", () => {
    const doc = createDoc();
    const maps = getMaps(doc);
    const hidden = createEmptyHiddenState();

    const result = applyIntentToDoc(doc, {
      id: "intent-2",
      type: "player.join",
      payload: { actorId: "p1", player: makePlayer("p1") },
    }, hidden);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.hiddenChanged).toBe(true);
    }
    expect(maps.meta.get("hostId")).toBe("p1");
    expect(hidden.handOrder.p1).toEqual([]);
    expect(hidden.libraryOrder.p1).toEqual([]);
    expect(hidden.sideboardOrder.p1).toEqual([]);
  });

  it("should reveal the library top card to all when top reveal is enabled", () => {
    const doc = createDoc();
    const maps = getMaps(doc);
    const hidden = createEmptyHiddenState();

    writePlayer(maps, makePlayer("p1"));
    writeZone(maps, makeZone("lib-p1", ZONE.LIBRARY, "p1"));

    hidden.libraryOrder.p1 = ["c1", "c2"];
    hidden.cards.c1 = makeCard("c1", "p1", "lib-p1");
    hidden.cards.c2 = makeCard("c2", "p1", "lib-p1");

    const result = applyIntentToDoc(doc, {
      id: "intent-3",
      type: "player.update",
      payload: {
        actorId: "p1",
        playerId: "p1",
        updates: { libraryTopReveal: "all" },
      },
    }, hidden);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.hiddenChanged).toBe(true);
      expect(result.logEvents).toEqual([
        {
          eventId: "library.topReveal",
          payload: { actorId: "p1", playerId: "p1", enabled: true, mode: "all" },
        },
      ]);
    }

    const topEntry = maps.libraryRevealsToAll.get("c2");
    expect(topEntry).toMatchObject({ ownerId: "p1" });
    const player = readPlayer(maps, "p1");
    expect(player?.libraryTopReveal).toBe("all");
  });

  it("should add cards to a hidden zone for the owning player", () => {
    const doc = createDoc();
    const maps = getMaps(doc);
    const hidden = createEmptyHiddenState();

    writePlayer(maps, makePlayer("p1"));
    writeZone(maps, makeZone("hand-p1", ZONE.HAND, "p1"));

    const result = applyIntentToDoc(doc, {
      id: "intent-4",
      type: "card.add",
      payload: {
        actorId: "p1",
        card: makeCard("c1", "p1", "hand-p1"),
      },
    }, hidden);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.hiddenChanged).toBe(true);
    }
    expect(hidden.handOrder.p1).toEqual(["c1"]);
    expect(hidden.cards.c1?.zoneId).toBe("hand-p1");
    expect(maps.cards.get("c1")).toBeUndefined();
    expect(readZone(maps, "hand-p1")?.cardIds).toEqual(["c1"]);
    expect(readPlayer(maps, "p1")?.handCount).toBe(1);
  });

  it("should reject card adds into hidden zones owned by other players", () => {
    const doc = createDoc();
    const maps = getMaps(doc);
    const hidden = createEmptyHiddenState();

    writePlayer(maps, makePlayer("p1"));
    writeZone(maps, makeZone("hand-p1", ZONE.HAND, "p1"));

    const result = applyIntentToDoc(doc, {
      id: "intent-5",
      type: "card.add",
      payload: {
        actorId: "p2",
        card: makeCard("c1", "p1", "hand-p1"),
      },
    }, hidden);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Cannot place into a hidden zone you do not own");
    }
    expect(hidden.handOrder.p1).toBeUndefined();
    expect(maps.cards.get("c1")).toBeUndefined();
  });

  it("should redact card names when moving to hidden zones", () => {
    const doc = createDoc();
    const maps = getMaps(doc);
    const hidden = createEmptyHiddenState();

    const battlefield = makeZone("bf-p1", ZONE.BATTLEFIELD, "p1", ["c1"]);
    const hand = makeZone("hand-p1", ZONE.HAND, "p1");
    writeZone(maps, battlefield);
    writeZone(maps, hand);
    writeCard(maps, makeCard("c1", "p1", battlefield.id));

    const result = applyIntentToDoc(doc, {
      id: "intent-6",
      type: "card.move",
      payload: { actorId: "p1", cardId: "c1", toZoneId: hand.id },
    }, hidden);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.hiddenChanged).toBe(true);
      expect(result.logEvents).toHaveLength(1);
      expect(result.logEvents[0]).toMatchObject({
        eventId: "card.move",
        payload: { cardName: "a card", forceHidden: true },
      });
    }
    expect(hidden.handOrder.p1).toEqual(["c1"]);
    expect(hidden.cards.c1?.zoneId).toBe(hand.id);
    expect(maps.cards.get("c1")).toBeUndefined();
    expect(readZone(maps, battlefield.id)?.cardIds).toEqual([]);
  });

  it("should log face-up reveals when turning a facedown battlefield card face up", () => {
    const doc = createDoc();
    const maps = getMaps(doc);
    const hidden = createEmptyHiddenState();

    writePlayer(maps, makePlayer("p1"));
    const battlefield = makeZone("bf-p1", ZONE.BATTLEFIELD, "p1", ["c1"]);
    writeZone(maps, battlefield);
    writeCard(
      maps,
      makeCard("c1", "p1", battlefield.id, { faceDown: true, name: "Card" })
    );

    hidden.faceDownBattlefield.c1 = { name: "Mystery Card" };

    const result = applyIntentToDoc(
      doc,
      {
        id: "intent-faceup",
        type: "card.update",
        payload: { actorId: "p1", cardId: "c1", updates: { faceDown: false } },
      },
      hidden
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.logEvents).toEqual([
        {
          eventId: "card.faceUp",
          payload: {
            actorId: "p1",
            cardId: "c1",
            zoneId: battlefield.id,
            cardName: "Mystery Card",
          },
        },
      ]);
    }
  });

  it("should reject deck resets when the actor cannot view the library", () => {
    const doc = createDoc();
    const maps = getMaps(doc);
    const hidden = createEmptyHiddenState();

    writePlayer(maps, makePlayer("p1"));
    writeZone(maps, makeZone("lib-p1", ZONE.LIBRARY, "p1"));

    const result = applyIntentToDoc(doc, {
      id: "intent-7",
      type: "deck.reset",
      payload: { actorId: "p2", playerId: "p1" },
    }, hidden);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Hidden zone");
    }
  });

  it("should log deck reset events for allowed actors", () => {
    const doc = createDoc();
    const maps = getMaps(doc);
    const hidden = createEmptyHiddenState();

    writePlayer(maps, makePlayer("p1", { libraryTopReveal: "all" }));
    writeZone(maps, makeZone("lib-p1", ZONE.LIBRARY, "p1"));
    writeZone(maps, makeZone("hand-p1", ZONE.HAND, "p1"));

    hidden.libraryOrder.p1 = ["c1", "c2"];
    hidden.cards.c1 = makeCard("c1", "p1", "lib-p1");
    hidden.cards.c2 = makeCard("c2", "p1", "lib-p1");

    const result = applyIntentToDoc(doc, {
      id: "intent-8",
      type: "deck.reset",
      payload: { actorId: "p1", playerId: "p1" },
    }, hidden);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.hiddenChanged).toBe(true);
      expect(result.logEvents).toEqual([
        { eventId: "deck.reset", payload: { actorId: "p1", playerId: "p1" } },
      ]);
    }
    expect(hidden.handOrder.p1).toEqual([]);
    expect(readPlayer(maps, "p1")?.libraryTopReveal).toBeUndefined();
  });

  it("should set deckLoaded when a player loads their own deck", () => {
    const doc = createDoc();
    const maps = getMaps(doc);
    const hidden = createEmptyHiddenState();

    writePlayer(maps, makePlayer("p1", { deckLoaded: false }));

    const result = applyIntentToDoc(doc, {
      id: "intent-9",
      type: "deck.load",
      payload: { actorId: "p1", playerId: "p1" },
    }, hidden);

    expect(result.ok).toBe(true);
    expect(readPlayer(maps, "p1")?.deckLoaded).toBe(true);
  });

  it("should reject deck load when the actor does not match the player", () => {
    const doc = createDoc();
    const maps = getMaps(doc);
    const hidden = createEmptyHiddenState();

    writePlayer(maps, makePlayer("p1", { deckLoaded: false }));

    const result = applyIntentToDoc(doc, {
      id: "intent-10",
      type: "deck.load",
      payload: { actorId: "p2", playerId: "p1" },
    }, hidden);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("actor mismatch");
    }
    expect(readPlayer(maps, "p1")?.deckLoaded).toBe(false);
  });

  it("should unload decks and emit a log event for allowed actors", () => {
    const doc = createDoc();
    const maps = getMaps(doc);
    const hidden = createEmptyHiddenState();

    writePlayer(maps, makePlayer("p1", { deckLoaded: true }));
    const library = makeZone("lib-p1", ZONE.LIBRARY, "p1", ["c1"]);
    const hand = makeZone("hand-p1", ZONE.HAND, "p1", ["c2"]);
    writeZone(maps, library);
    writeZone(maps, hand);
    writeCard(maps, makeCard("c1", "p1", library.id));
    writeCard(maps, makeCard("c2", "p1", hand.id));

    hidden.libraryOrder.p1 = ["h1"];
    hidden.cards.h1 = makeCard("h1", "p1", library.id);

    const result = applyIntentToDoc(doc, {
      id: "intent-11",
      type: "deck.unload",
      payload: { actorId: "p1", playerId: "p1" },
    }, hidden);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.hiddenChanged).toBe(true);
      expect(result.logEvents).toEqual([
        { eventId: "deck.unload", payload: { actorId: "p1", playerId: "p1" } },
      ]);
    }
    expect(readPlayer(maps, "p1")?.deckLoaded).toBe(false);
    expect(readZone(maps, library.id)?.cardIds).toEqual([]);
    expect(readZone(maps, hand.id)?.cardIds).toEqual([]);
    expect(hidden.libraryOrder.p1).toEqual([]);
  });

  it("should emit draw logs when a player mulligans", () => {
    const doc = createDoc();
    const maps = getMaps(doc);
    const hidden = createEmptyHiddenState();

    writePlayer(maps, makePlayer("p1"));
    writeZone(maps, makeZone("lib-p1", ZONE.LIBRARY, "p1"));
    writeZone(maps, makeZone("hand-p1", ZONE.HAND, "p1"));

    hidden.libraryOrder.p1 = ["c1", "c2"];
    hidden.cards.c1 = makeCard("c1", "p1", "lib-p1");
    hidden.cards.c2 = makeCard("c2", "p1", "lib-p1");

    const result = applyIntentToDoc(doc, {
      id: "intent-12",
      type: "deck.mulligan",
      payload: { actorId: "p1", playerId: "p1", count: 3 },
    }, hidden);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.hiddenChanged).toBe(true);
      expect(result.logEvents).toEqual([
        { eventId: "deck.reset", payload: { actorId: "p1", playerId: "p1" } },
        { eventId: "card.draw", payload: { actorId: "p1", playerId: "p1", count: 2 } },
      ]);
    }
    expect(hidden.handOrder.p1).toHaveLength(2);
  });

  it("should duplicate a battlefield card for the controller", () => {
    const doc = createDoc();
    const maps = getMaps(doc);
    const hidden = createEmptyHiddenState();

    const battlefield = makeZone("bf-p1", ZONE.BATTLEFIELD, "p1", ["c1"]);
    writeZone(maps, battlefield);
    writeCard(maps, makeCard("c1", "p1", battlefield.id));

    const result = applyIntentToDoc(doc, {
      id: "intent-13",
      type: "card.duplicate",
      payload: { actorId: "p1", cardId: "c1", newCardId: "c2" },
    }, hidden);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.logEvents).toEqual([
        {
          eventId: "card.duplicate",
          payload: {
            actorId: "p1",
            sourceCardId: "c1",
            newCardId: "c2",
            zoneId: battlefield.id,
            cardName: "Card c1",
          },
        },
      ]);
    }
    expect(maps.cards.get("c2")).toMatchObject({ isToken: true });
    expect(readZone(maps, battlefield.id)?.cardIds).toEqual(["c1", "c2"]);
  });

  it("should reject card duplication when the actor is not the controller", () => {
    const doc = createDoc();
    const maps = getMaps(doc);
    const hidden = createEmptyHiddenState();

    const battlefield = makeZone("bf-p1", ZONE.BATTLEFIELD, "p1", ["c1"]);
    writeZone(maps, battlefield);
    writeCard(maps, makeCard("c1", "p1", battlefield.id, { controllerId: "p1" }));

    const result = applyIntentToDoc(doc, {
      id: "intent-14",
      type: "card.duplicate",
      payload: { actorId: "p2", cardId: "c1", newCardId: "c2" },
    }, hidden);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Only controller");
    }
    expect(maps.cards.get("c2")).toBeUndefined();
  });

  it("should tap a battlefield card for the controller", () => {
    const doc = createDoc();
    const maps = getMaps(doc);
    const hidden = createEmptyHiddenState();

    const battlefield = makeZone("bf-p1", ZONE.BATTLEFIELD, "p1", ["c1"]);
    writeZone(maps, battlefield);
    writeCard(maps, makeCard("c1", "p1", battlefield.id));

    const result = applyIntentToDoc(doc, {
      id: "intent-15",
      type: "card.tap",
      payload: { actorId: "p1", cardId: "c1", tapped: true },
    }, hidden);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.logEvents).toEqual([
        {
          eventId: "card.tap",
          payload: {
            actorId: "p1",
            cardId: "c1",
            zoneId: battlefield.id,
            tapped: true,
            cardName: "Card c1",
          },
        },
      ]);
    }
    expect(maps.cards.get("c1")).toMatchObject({ tapped: true });
  });

  it("should untap only the actor's controlled cards", () => {
    const doc = createDoc();
    const maps = getMaps(doc);
    const hidden = createEmptyHiddenState();

    const battlefield = makeZone("bf-p1", ZONE.BATTLEFIELD, "p1", ["c1", "c2"]);
    writeZone(maps, battlefield);
    writeCard(maps, makeCard("c1", "p1", battlefield.id, { tapped: true }));
    writeCard(maps, makeCard("c2", "p1", battlefield.id, { tapped: true, controllerId: "p2" }));

    const result = applyIntentToDoc(doc, {
      id: "intent-16",
      type: "card.untapAll",
      payload: { actorId: "p1", playerId: "p1" },
    }, hidden);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.logEvents).toEqual([
        { eventId: "card.untapAll", payload: { actorId: "p1", playerId: "p1" } },
      ]);
    }
    expect(maps.cards.get("c1")).toMatchObject({ tapped: false });
    expect(maps.cards.get("c2")).toMatchObject({ tapped: true });
  });

  it("should reject library draw when the actor cannot view the library", () => {
    const doc = createDoc();
    const maps = getMaps(doc);
    const hidden = createEmptyHiddenState();

    writeZone(maps, makeZone("lib-p1", ZONE.LIBRARY, "p1"));
    writeZone(maps, makeZone("hand-p1", ZONE.HAND, "p1"));
    hidden.libraryOrder.p1 = ["c1"];
    hidden.cards.c1 = makeCard("c1", "p1", "lib-p1");

    const result = applyIntentToDoc(doc, {
      id: "intent-17",
      type: "library.draw",
      payload: { actorId: "p2", playerId: "p1", count: 1 },
    }, hidden);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Hidden zone");
    }
    expect(hidden.libraryOrder.p1).toEqual(["c1"]);
  });

  it("should discard from the library and emit per-card logs", () => {
    const doc = createDoc();
    const maps = getMaps(doc);
    const hidden = createEmptyHiddenState();

    const library = makeZone("lib-p1", ZONE.LIBRARY, "p1");
    const graveyard = makeZone("gy-p1", ZONE.GRAVEYARD, "p1");
    writeZone(maps, library);
    writeZone(maps, graveyard);

    hidden.libraryOrder.p1 = ["c1", "c2"];
    hidden.cards.c1 = makeCard("c1", "p1", library.id);
    hidden.cards.c2 = makeCard("c2", "p1", library.id);

    const result = applyIntentToDoc(doc, {
      id: "intent-18",
      type: "library.discard",
      payload: { actorId: "p1", playerId: "p1", count: 3 },
    }, hidden);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const eventIds = result.logEvents.map((event) => event.eventId);
      expect(eventIds).toEqual(["card.discard", "card.discard"]);
    }
    expect(hidden.libraryOrder.p1).toEqual([]);
    expect(readZone(maps, graveyard.id)?.cardIds.length).toBe(2);
  });

  it("should remove tokens when card.remove is called for a public token", () => {
    const doc = createDoc();
    const maps = getMaps(doc);
    const hidden = createEmptyHiddenState();

    const battlefield = makeZone("bf-p1", ZONE.BATTLEFIELD, "p1", ["t1"]);
    writeZone(maps, battlefield);
    writeCard(maps, makeCard("t1", "p1", battlefield.id, { isToken: true }));

    const result = applyIntentToDoc(doc, {
      id: "intent-19",
      type: "card.remove",
      payload: { actorId: "p1", cardId: "t1" },
    }, hidden);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.logEvents).toEqual([
        {
          eventId: "card.remove",
          payload: {
            actorId: "p1",
            cardId: "t1",
            zoneId: battlefield.id,
            cardName: "Card t1",
          },
        },
      ]);
    }
    expect(maps.cards.get("t1")).toBeUndefined();
    expect(readZone(maps, battlefield.id)?.cardIds).toEqual([]);
  });

  it("should remove hidden tokens and redact names in logs", () => {
    const doc = createDoc();
    const maps = getMaps(doc);
    const hidden = createEmptyHiddenState();

    const hand = makeZone("hand-p1", ZONE.HAND, "p1", ["t1"]);
    writeZone(maps, hand);
    hidden.handOrder.p1 = ["t1"];
    hidden.cards.t1 = makeCard("t1", "p1", hand.id, { isToken: true });

    const result = applyIntentToDoc(doc, {
      id: "intent-20",
      type: "card.remove",
      payload: { actorId: "p1", cardId: "t1" },
    }, hidden);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.hiddenChanged).toBe(true);
      expect(result.logEvents).toEqual([
        {
          eventId: "card.remove",
          payload: {
            actorId: "p1",
            cardId: "t1",
            zoneId: hand.id,
            cardName: "a card",
          },
        },
      ]);
    }
    expect(hidden.handOrder.p1).toEqual([]);
    expect(hidden.cards.t1).toBeUndefined();
  });
});
