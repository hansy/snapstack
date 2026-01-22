import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import { applyIntentToDoc } from "../domain/intents/applyIntentToDoc";
import { buildOverlayForViewer } from "../domain/overlay";
import { createEmptyHiddenState } from "../domain/hiddenState";
import type { Card } from "../../../web/src/types/cards";
import type { Player } from "../../../web/src/types/players";
import type { Zone, ZoneType } from "../../../web/src/types/zones";

const createDoc = () => {
  const doc = new Y.Doc();
  doc.getMap("players");
  doc.getArray<string>("playerOrder");
  doc.getMap("zones");
  doc.getMap("cards");
  doc.getMap<Y.Array<string>>("zoneCardOrders");
  doc.getMap("globalCounters");
  doc.getMap("battlefieldViewScale");
  doc.getMap("meta");
  doc.getMap("handRevealsToAll");
  doc.getMap("libraryRevealsToAll");
  doc.getMap("faceDownRevealsToAll");
  return doc;
};

const getMaps = (doc: Y.Doc) => ({
  players: doc.getMap("players"),
  playerOrder: doc.getArray<string>("playerOrder"),
  zones: doc.getMap("zones"),
  cards: doc.getMap("cards"),
  zoneCardOrders: doc.getMap<Y.Array<string>>("zoneCardOrders"),
  globalCounters: doc.getMap("globalCounters"),
  battlefieldViewScale: doc.getMap("battlefieldViewScale"),
  meta: doc.getMap("meta"),
  handRevealsToAll: doc.getMap("handRevealsToAll"),
  libraryRevealsToAll: doc.getMap("libraryRevealsToAll"),
  faceDownRevealsToAll: doc.getMap("faceDownRevealsToAll"),
});

const createPlayer = (id: string, overrides: Partial<Player> = {}): Player => ({
  id,
  name: `Player ${id}`,
  life: 20,
  counters: [],
  commanderDamage: {},
  commanderTax: 0,
  ...overrides,
});

const createZone = (
  id: string,
  type: ZoneType,
  ownerId: string,
  cardIds: string[] = []
): Zone => ({
  id,
  type,
  ownerId,
  cardIds,
});

const createCard = (
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

const seedPlayers = (doc: Y.Doc, players: Player[]) => {
  const map = doc.getMap("players");
  const order = doc.getArray("playerOrder");
  order.delete(0, order.length);
  players.forEach((player) => map.set(player.id, player));
  if (players.length) {
    order.insert(
      0,
      players.map((player) => player.id)
    );
  }
};

const seedZones = (doc: Y.Doc, zones: Zone[]) => {
  const map = doc.getMap("zones");
  zones.forEach((zone) => map.set(zone.id, zone));
};

const seedCards = (doc: Y.Doc, cards: Card[]) => {
  const map = doc.getMap("cards");
  cards.forEach((card) => map.set(card.id, card));
};

const expectSameMembers = (left: string[], right: string[]) => {
  expect([...left].sort()).toEqual([...right].sort());
};

describe("server migration behavior", () => {
  it("shows hand cards only to owner unless spectator", () => {
    const doc = createDoc();
    seedPlayers(doc, [createPlayer("p1"), createPlayer("p2")]);
    const p1Hand = createZone("hand-p1", "hand", "p1");
    const p2Hand = createZone("hand-p2", "hand", "p2");
    seedZones(doc, [p1Hand, p2Hand]);

    const hidden = createEmptyHiddenState();
    hidden.handOrder = { p1: ["h1"], p2: ["h2"] };
    hidden.cards = {
      h1: createCard("h1", "p1", p1Hand.id),
      h2: createCard("h2", "p2", p2Hand.id),
    };

    const maps = getMaps(doc);
    const p1Overlay = buildOverlayForViewer({
      maps,
      hidden,
      viewerId: "p1",
      viewerRole: "player",
    });
    expect(p1Overlay.cards.map((card) => card.id).sort()).toEqual(["h1"]);

    const spectatorOverlay = buildOverlayForViewer({
      maps,
      hidden,
      viewerRole: "spectator",
    });
    expect(spectatorOverlay.cards.map((card) => card.id).sort()).toEqual([
      "h1",
      "h2",
    ]);
  });

  it("reveals hand cards to explicitly targeted players", () => {
    const doc = createDoc();
    seedPlayers(doc, [
      createPlayer("p1"),
      createPlayer("p2"),
      createPlayer("p3"),
    ]);
    const p1Hand = createZone("hand-p1", "hand", "p1");
    seedZones(doc, [p1Hand]);

    const hidden = createEmptyHiddenState();
    hidden.handOrder = { p1: ["h1"] };
    hidden.cards = { h1: createCard("h1", "p1", p1Hand.id) };
    hidden.handReveals = { h1: { toPlayers: ["p2"] } };

    const maps = getMaps(doc);
    const p2Overlay = buildOverlayForViewer({
      maps,
      hidden,
      viewerId: "p2",
      viewerRole: "player",
    });
    expect(p2Overlay.cards.map((card) => card.id)).toEqual(["h1"]);

    const p3Overlay = buildOverlayForViewer({
      maps,
      hidden,
      viewerId: "p3",
      viewerRole: "player",
    });
    expect(p3Overlay.cards.map((card) => card.id)).toEqual([]);
  });

  it("shows face-down identities to controller and spectators only", () => {
    const doc = createDoc();
    seedPlayers(doc, [createPlayer("p1"), createPlayer("p2")]);
    const battlefield = createZone("battlefield-p1", "battlefield", "p1", [
      "fd1",
    ]);
    seedZones(doc, [battlefield]);
    seedCards(doc, [
      createCard("fd1", "p1", battlefield.id, {
        name: "Unknown",
        controllerId: "p1",
        faceDown: true,
      }),
    ]);

    const hidden = createEmptyHiddenState();
    hidden.faceDownBattlefield = {
      fd1: {
        name: "Mystery Card",
      },
    };

    const maps = getMaps(doc);
    const controllerOverlay = buildOverlayForViewer({
      maps,
      hidden,
      viewerId: "p1",
      viewerRole: "player",
    });
    expect(controllerOverlay.cards.map((card) => card.id)).toEqual(["fd1"]);
    expect(controllerOverlay.cards[0]?.name).toBe("Mystery Card");

    const otherOverlay = buildOverlayForViewer({
      maps,
      hidden,
      viewerId: "p2",
      viewerRole: "player",
    });
    expect(otherOverlay.cards.map((card) => card.id)).toEqual([]);

    const spectatorOverlay = buildOverlayForViewer({
      maps,
      hidden,
      viewerRole: "spectator",
    });
    expect(spectatorOverlay.cards.map((card) => card.id)).toEqual(["fd1"]);
  });

  it("should reveal the top library card to all when a player enables top reveal", () => {
    const doc = createDoc();
    seedPlayers(doc, [
      createPlayer("p1", { libraryTopReveal: "all" }),
      createPlayer("p2"),
    ]);
    const library = createZone("lib-p1", "library", "p1");
    seedZones(doc, [library]);

    const hidden = createEmptyHiddenState();
    hidden.libraryOrder = { p1: ["l1", "l2"] };
    hidden.cards = {
      l1: createCard("l1", "p1", library.id),
      l2: createCard("l2", "p1", library.id),
    };

    const maps = getMaps(doc);
    const p2Overlay = buildOverlayForViewer({
      maps,
      hidden,
      viewerId: "p2",
      viewerRole: "player",
    });

    expect(p2Overlay.cards.map((card) => card.id)).toEqual(["l2"]);
  });


  it("denies moving cards from another player's hidden zone", () => {
    const doc = createDoc();
    seedPlayers(doc, [createPlayer("p1"), createPlayer("p2")]);
    const p1Hand = createZone("hand-p1", "hand", "p1", ["h1"]);
    const p2Battlefield = createZone("battlefield-p2", "battlefield", "p2");
    seedZones(doc, [p1Hand, p2Battlefield]);

    const hidden = createEmptyHiddenState();
    hidden.handOrder = { p1: ["h1"] };
    hidden.cards = { h1: createCard("h1", "p1", p1Hand.id) };

    const result = applyIntentToDoc(
      doc,
      {
        id: "intent-1",
        type: "card.move",
        payload: {
          actorId: "p2",
          cardId: "h1",
          toZoneId: p2Battlefield.id,
        },
      },
      hidden
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe(
        "Cannot move from a hidden zone you do not own"
      );
    }
  });

  it("emits one log entry per draw", () => {
    const doc = createDoc();
    seedPlayers(doc, [createPlayer("p1")]);
    const p1Library = createZone("library-p1", "library", "p1");
    const p1Hand = createZone("hand-p1", "hand", "p1");
    seedZones(doc, [p1Library, p1Hand]);

    const hidden = createEmptyHiddenState();
    hidden.libraryOrder = { p1: ["l1", "l2"] };
    hidden.handOrder = { p1: [] };
    hidden.cards = {
      l1: createCard("l1", "p1", p1Library.id),
      l2: createCard("l2", "p1", p1Library.id),
    };

    const result = applyIntentToDoc(
      doc,
      {
        id: "intent-2",
        type: "library.draw",
        payload: {
          actorId: "p1",
          playerId: "p1",
          count: 2,
        },
      },
      hidden
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.logEvents.map((event) => event.eventId)).toEqual([
        "card.draw",
        "card.draw",
      ]);
    }
  });

  it("limits library view overlay to requested count", () => {
    const doc = createDoc();
    seedPlayers(doc, [createPlayer("p1")]);
    const library = createZone("library-p1", "library", "p1");
    seedZones(doc, [library]);

    const hidden = createEmptyHiddenState();
    hidden.libraryOrder = {
      p1: ["c1", "c2", "c3", "c4", "c5"],
    };
    hidden.cards = {
      c1: createCard("c1", "p1", library.id),
      c2: createCard("c2", "p1", library.id),
      c3: createCard("c3", "p1", library.id),
      c4: createCard("c4", "p1", library.id),
      c5: createCard("c5", "p1", library.id),
    };

    const overlay = buildOverlayForViewer({
      maps: getMaps(doc),
      hidden,
      viewerId: "p1",
      viewerRole: "player",
      libraryView: { playerId: "p1", count: 2 },
    });

    expect(overlay.cards.map((card) => card.id).sort()).toEqual(["c4", "c5"]);
    expect(overlay.zoneCardOrders?.[library.id]).toEqual(["c4", "c5"]);
  });

  it("does not expose library view overlay to spectators", () => {
    const doc = createDoc();
    seedPlayers(doc, [createPlayer("p1")]);
    const library = createZone("library-p1", "library", "p1");
    seedZones(doc, [library]);

    const hidden = createEmptyHiddenState();
    hidden.libraryOrder = { p1: ["c1", "c2"] };
    hidden.cards = {
      c1: createCard("c1", "p1", library.id),
      c2: createCard("c2", "p1", library.id),
    };

    const overlay = buildOverlayForViewer({
      maps: getMaps(doc),
      hidden,
      viewerRole: "spectator",
      libraryView: { playerId: "p1", count: 2 },
    });

    expect(overlay.cards).toHaveLength(0);
    expect(overlay.zoneCardOrders).toBeUndefined();
  });

  it("respects library top reveal modes", () => {
    const doc = createDoc();
    const p1 = createPlayer("p1", { libraryTopReveal: "all" });
    const p2 = createPlayer("p2");
    seedPlayers(doc, [p1, p2]);
    const library = createZone("library-p1", "library", "p1");
    seedZones(doc, [library]);

    const hidden = createEmptyHiddenState();
    hidden.libraryOrder = { p1: ["c1", "c2"] };
    hidden.cards = {
      c1: createCard("c1", "p1", library.id),
      c2: createCard("c2", "p1", library.id),
    };

    const maps = getMaps(doc);
    const otherOverlay = buildOverlayForViewer({
      maps,
      hidden,
      viewerId: "p2",
      viewerRole: "player",
    });
    expect(otherOverlay.cards.map((card) => card.id)).toEqual(["c2"]);

    const playersMap = doc.getMap("players");
    playersMap.set("p1", { ...p1, libraryTopReveal: "self" });

    const otherOverlaySelf = buildOverlayForViewer({
      maps: getMaps(doc),
      hidden,
      viewerId: "p2",
      viewerRole: "player",
    });
    expect(otherOverlaySelf.cards).toHaveLength(0);

    const ownerOverlaySelf = buildOverlayForViewer({
      maps: getMaps(doc),
      hidden,
      viewerId: "p1",
      viewerRole: "player",
    });
    expect(ownerOverlaySelf.cards.map((card) => card.id)).toEqual(["c2"]);
  });

  it("denies reveal intent from non-owner and publishes to-all reveals", () => {
    const doc = createDoc();
    seedPlayers(doc, [createPlayer("p1"), createPlayer("p2")]);
    const library = createZone("library-p1", "library", "p1");
    seedZones(doc, [library]);

    const hidden = createEmptyHiddenState();
    hidden.libraryOrder = { p1: ["c1"] };
    hidden.cards = { c1: createCard("c1", "p1", library.id) };

    const denied = applyIntentToDoc(
      doc,
      {
        id: "intent-5",
        type: "card.reveal.set",
        payload: {
          actorId: "p2",
          cardId: "c1",
          reveal: { toAll: true },
        },
      },
      hidden
    );
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.error).toBe("Only owner may reveal this card");
    }

    const allowed = applyIntentToDoc(
      doc,
      {
        id: "intent-6",
        type: "card.reveal.set",
        payload: {
          actorId: "p1",
          cardId: "c1",
          reveal: { toAll: true },
        },
      },
      hidden
    );
    expect(allowed.ok).toBe(true);
    const revealEntry = doc.getMap("libraryRevealsToAll").get("c1") as {
      card?: { name?: string };
    };
    expect(revealEntry?.card?.name).toBe("Card c1");
  });

  it("allows controller to reveal face-down battlefield cards to specific players", () => {
    const doc = createDoc();
    seedPlayers(doc, [
      createPlayer("p1"),
      createPlayer("p2"),
      createPlayer("p3"),
    ]);
    const battlefield = createZone("bf-p1", "battlefield", "p1", ["c1"]);
    seedZones(doc, [battlefield]);

    seedCards(doc, [
      createCard("c1", "p1", battlefield.id, {
        faceDown: true,
        controllerId: "p1",
      }),
    ]);

    const hidden = createEmptyHiddenState();
    hidden.faceDownBattlefield = { c1: { name: "Secret Card" } };

    const result = applyIntentToDoc(
      doc,
      {
        id: "intent-fd-reveal",
        type: "card.reveal.set",
        payload: {
          actorId: "p1",
          cardId: "c1",
          reveal: { to: ["p2"] },
        },
      },
      hidden
    );
    expect(result.ok).toBe(true);

    const p2Overlay = buildOverlayForViewer({
      maps: getMaps(doc),
      hidden,
      viewerId: "p2",
      viewerRole: "player",
    });
    expect(p2Overlay.cards.map((card) => card.id)).toEqual(["c1"]);
    expect(p2Overlay.cards[0]?.name).toBe("Secret Card");

    const p3Overlay = buildOverlayForViewer({
      maps: getMaps(doc),
      hidden,
      viewerId: "p3",
      viewerRole: "player",
    });
    expect(p3Overlay.cards).toHaveLength(0);
  });

  it("logs library view intents without mutating order", () => {
    const doc = createDoc();
    seedPlayers(doc, [createPlayer("p1")]);
    const library = createZone("library-p1", "library", "p1");
    seedZones(doc, [library]);

    const hidden = createEmptyHiddenState();
    hidden.libraryOrder = { p1: ["c1", "c2", "c3"] };
    hidden.cards = {
      c1: createCard("c1", "p1", library.id),
      c2: createCard("c2", "p1", library.id),
      c3: createCard("c3", "p1", library.id),
    };

    const result = applyIntentToDoc(
      doc,
      {
        id: "intent-7",
        type: "library.view",
        payload: {
          actorId: "p1",
          playerId: "p1",
          count: 2,
        },
      },
      hidden
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.logEvents).toHaveLength(1);
      expect(result.logEvents[0]?.eventId).toBe("library.view");
      expect(result.logEvents[0]?.payload).toMatchObject({
        actorId: "p1",
        playerId: "p1",
        count: 2,
      });
    }
    expect(hidden.libraryOrder.p1).toEqual(["c1", "c2", "c3"]);
  });

  it("clears library reveals and known-to-all flags on shuffle", () => {
    const doc = createDoc();
    seedPlayers(doc, [createPlayer("p1")]);
    const library = createZone("library-p1", "library", "p1");
    seedZones(doc, [library]);

    const hidden = createEmptyHiddenState();
    hidden.libraryOrder = { p1: ["c1", "c2", "c3"] };
    hidden.cards = {
      c1: createCard("c1", "p1", library.id, { knownToAll: true }),
      c2: createCard("c2", "p1", library.id, { knownToAll: true }),
      c3: createCard("c3", "p1", library.id, { knownToAll: true }),
    };
    hidden.libraryReveals = {
      c1: { toAll: true },
      c2: { toPlayers: ["p1"] },
    };
    const revealsToAll = doc.getMap("libraryRevealsToAll");
    revealsToAll.set("c1", { card: { name: "Card c1" }, orderKey: "k1" });
    revealsToAll.set("c2", { card: { name: "Card c2" }, orderKey: "k2" });

    const result = applyIntentToDoc(
      doc,
      {
        id: "intent-8",
        type: "library.shuffle",
        payload: {
          actorId: "p1",
          playerId: "p1",
        },
      },
      hidden
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.logEvents.map((event) => event.eventId)).toEqual([
        "library.shuffle",
      ]);
    }
    const shuffled = hidden.libraryOrder.p1;
    expect([...shuffled].sort()).toEqual(["c1", "c2", "c3"]);
    expect(hidden.libraryReveals.c1).toBeUndefined();
    expect(hidden.libraryReveals.c2).toBeUndefined();
    expect(revealsToAll.size).toBe(0);
    expect(hidden.cards.c1?.knownToAll).toBe(false);
    expect(hidden.cards.c2?.knownToAll).toBe(false);
  });

  it("moves discarded cards from library to graveyard with log entries", () => {
    const doc = createDoc();
    seedPlayers(doc, [createPlayer("p1")]);
    const library = createZone("library-p1", "library", "p1");
    const graveyard = createZone("graveyard-p1", "graveyard", "p1");
    seedZones(doc, [library, graveyard]);

    const hidden = createEmptyHiddenState();
    hidden.libraryOrder = { p1: ["c1", "c2"] };
    hidden.cards = {
      c1: createCard("c1", "p1", library.id),
      c2: createCard("c2", "p1", library.id),
    };

    const result = applyIntentToDoc(
      doc,
      {
        id: "intent-9",
        type: "library.discard",
        payload: {
          actorId: "p1",
          playerId: "p1",
          count: 1,
        },
      },
      hidden
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.logEvents.map((event) => event.eventId)).toEqual([
        "card.discard",
      ]);
      expect(result.logEvents[0]?.payload).toMatchObject({
        actorId: "p1",
        playerId: "p1",
        count: 1,
      });
    }
    expect(hidden.libraryOrder.p1).toEqual(["c1"]);
    expect(hidden.cards.c2).toBeUndefined();
    const graveyardZone = doc.getMap("zones").get(graveyard.id) as Zone;
    expect(graveyardZone.cardIds).toEqual(["c2"]);
    const publicCard = doc.getMap("cards").get("c2") as Card;
    expect(publicCard.zoneId).toBe(graveyard.id);
  });

  it("handles player join rules and initializes hidden state", () => {
    const doc = createDoc();
    const hidden = createEmptyHiddenState();

    const mismatch = applyIntentToDoc(
      doc,
      {
        id: "intent-15",
        type: "player.join",
        payload: {
          actorId: "p2",
          player: createPlayer("p1"),
        },
      },
      hidden
    );
    expect(mismatch.ok).toBe(false);
    if (!mismatch.ok) {
      expect(mismatch.error).toBe("actor mismatch");
    }

    const lockedDoc = createDoc();
    lockedDoc.getMap("meta").set("locked", true);
    const locked = applyIntentToDoc(
      lockedDoc,
      {
        id: "intent-16",
        type: "player.join",
        payload: {
          actorId: "p1",
          player: createPlayer("p1"),
        },
      },
      createEmptyHiddenState()
    );
    expect(locked.ok).toBe(false);
    if (!locked.ok) {
      expect(locked.error).toBe("room locked");
    }

    const fullDoc = createDoc();
    seedPlayers(fullDoc, [
      createPlayer("p1"),
      createPlayer("p2"),
      createPlayer("p3"),
      createPlayer("p4"),
    ]);
    const full = applyIntentToDoc(
      fullDoc,
      {
        id: "intent-17",
        type: "player.join",
        payload: {
          actorId: "p5",
          player: createPlayer("p5"),
        },
      },
      createEmptyHiddenState()
    );
    expect(full.ok).toBe(false);
    if (!full.ok) {
      expect(full.error).toBe("room full");
    }

    const joined = applyIntentToDoc(
      doc,
      {
        id: "intent-18",
        type: "player.join",
        payload: {
          actorId: "p1",
          player: createPlayer("p1"),
        },
      },
      hidden
    );
    expect(joined.ok).toBe(true);
    const player = doc.getMap("players").get("p1") as Player;
    expect(player.handCount).toBe(0);
    expect(player.libraryCount).toBe(0);
    expect(player.sideboardCount).toBe(0);
    const meta = doc.getMap("meta").get("hostId");
    expect(meta).toBe("p1");
    expect(hidden.handOrder.p1).toEqual([]);
    expect(hidden.libraryOrder.p1).toEqual([]);
    expect(hidden.sideboardOrder.p1).toEqual([]);
  });

  it("validates player updates and logs life/top reveal changes", () => {
    const doc = createDoc();
    seedPlayers(doc, [createPlayer("p1"), createPlayer("p2")]);
    const hidden = createEmptyHiddenState();

    const denied = applyIntentToDoc(
      doc,
      {
        id: "intent-19",
        type: "player.update",
        payload: {
          actorId: "p2",
          playerId: "p1",
          updates: { life: 10 },
        },
      },
      hidden
    );
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.error).toBe("Cannot change another player's life total");
    }

    const lifeUpdate = applyIntentToDoc(
      doc,
      {
        id: "intent-20",
        type: "player.update",
        payload: {
          actorId: "p1",
          playerId: "p1",
          updates: { life: 30 },
        },
      },
      hidden
    );
    expect(lifeUpdate.ok).toBe(true);
    if (lifeUpdate.ok) {
      expect(lifeUpdate.logEvents.map((event) => event.eventId)).toEqual([
        "player.life",
      ]);
    }
    const player = doc.getMap("players").get("p1") as Player;
    expect(player.life).toBe(30);

    const revealUpdate = applyIntentToDoc(
      doc,
      {
        id: "intent-21",
        type: "player.update",
        payload: {
          actorId: "p1",
          playerId: "p1",
          updates: { libraryTopReveal: "all" },
        },
      },
      hidden
    );
    expect(revealUpdate.ok).toBe(true);
    if (revealUpdate.ok) {
      expect(revealUpdate.logEvents.map((event) => event.eventId)).toEqual([
        "library.topReveal",
      ]);
    }
  });

  it("removes players and owned state on leave", () => {
    const doc = createDoc();
    seedPlayers(doc, [createPlayer("p1"), createPlayer("p2")]);
    doc.getMap("meta").set("hostId", "p1");
    const p1Zone = createZone("bf-p1", "battlefield", "p1", ["c1"]);
    const p2Zone = createZone("bf-p2", "battlefield", "p2", ["c2"]);
    seedZones(doc, [p1Zone, p2Zone]);
    seedCards(doc, [
      createCard("c1", "p1", p1Zone.id),
      createCard("c2", "p2", p2Zone.id),
    ]);

    const hidden = createEmptyHiddenState();
    hidden.handOrder = { p1: ["h1"] };
    hidden.cards = { h1: createCard("h1", "p1", "hand-p1") };
    hidden.faceDownBattlefield = { c1: { name: "Secret" } };

    const result = applyIntentToDoc(
      doc,
      {
        id: "intent-22",
        type: "player.leave",
        payload: {
          actorId: "p1",
          playerId: "p1",
        },
      },
      hidden
    );
    expect(result.ok).toBe(true);
    expect(doc.getMap("players").get("p1")).toBeUndefined();
    expect(doc.getMap("zones").get("bf-p1")).toBeUndefined();
    expect(doc.getMap("cards").get("c1")).toBeUndefined();
    expect(doc.getMap("meta").get("hostId")).toBe("p2");
    expect(hidden.handOrder.p1).toBeUndefined();
    expect(hidden.cards.h1).toBeUndefined();
    expect(hidden.faceDownBattlefield.c1).toBeUndefined();
  });

  it("adds zones only for owners and initializes hidden zone state", () => {
    const doc = createDoc();
    seedPlayers(doc, [createPlayer("p1")]);
    const hidden = createEmptyHiddenState();

    const denied = applyIntentToDoc(
      doc,
      {
        id: "intent-23",
        type: "zone.add",
        payload: {
          actorId: "p2",
          zone: createZone("hand-p1", "hand", "p1", ["h1"]),
        },
      },
      hidden
    );
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.error).toBe("Only zone owner may add zones");
    }

    const added = applyIntentToDoc(
      doc,
      {
        id: "intent-24",
        type: "zone.add",
        payload: {
          actorId: "p1",
          zone: createZone("hand-p1", "hand", "p1", ["h1"]),
        },
      },
      hidden
    );
    expect(added.ok).toBe(true);
    const zone = doc.getMap("zones").get("hand-p1") as Zone;
    expect(zone.cardIds).toEqual(["h1"]);
    expect(hidden.handOrder.p1).toEqual(["h1"]);

    const mismatch = applyIntentToDoc(
      doc,
      {
        id: "intent-25",
        type: "zone.add",
        payload: {
          actorId: "p1",
          zone: createZone("hand-p1", "library", "p1"),
        },
      },
      hidden
    );
    expect(mismatch.ok).toBe(false);
    if (!mismatch.ok) {
      expect(mismatch.error).toBe("zone mismatch");
    }
  });

  it("reorders zones with owner validation", () => {
    const doc = createDoc();
    seedPlayers(doc, [createPlayer("p1")]);
    const hand = createZone("hand-p1", "hand", "p1", ["h1", "h2"]);
    const battlefield = createZone("bf-p1", "battlefield", "p1", ["c1", "c2"]);
    seedZones(doc, [hand, battlefield]);

    const hidden = createEmptyHiddenState();
    hidden.handOrder = { p1: ["h1", "h2"] };
    hidden.cards = {
      h1: createCard("h1", "p1", hand.id),
      h2: createCard("h2", "p1", hand.id),
    };

    const invalid = applyIntentToDoc(
      doc,
      {
        id: "intent-26",
        type: "zone.reorder",
        payload: {
          actorId: "p1",
          zoneId: hand.id,
          orderedCardIds: ["h1"],
        },
      },
      hidden
    );
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) {
      expect(invalid.error).toBe("invalid reorder");
    }

    const reordered = applyIntentToDoc(
      doc,
      {
        id: "intent-27",
        type: "zone.reorder",
        payload: {
          actorId: "p1",
          zoneId: hand.id,
          orderedCardIds: ["h2", "h1"],
        },
      },
      hidden
    );
    expect(reordered.ok).toBe(true);
    expect(hidden.handOrder.p1).toEqual(["h2", "h1"]);
    const handZone = doc.getMap("zones").get(hand.id) as Zone;
    expect(handZone.cardIds).toEqual(["h2", "h1"]);

    const battlefieldReorder = applyIntentToDoc(
      doc,
      {
        id: "intent-28",
        type: "zone.reorder",
        payload: {
          actorId: "p1",
          zoneId: battlefield.id,
          orderedCardIds: ["c2", "c1"],
        },
      },
      hidden
    );
    expect(battlefieldReorder.ok).toBe(true);
    const battlefieldZone = doc.getMap("zones").get(battlefield.id) as Zone;
    expect(battlefieldZone.cardIds).toEqual(["c2", "c1"]);
  });

  it("rejects zone reorders from non-owners", () => {
    const doc = createDoc();
    seedPlayers(doc, [createPlayer("p1"), createPlayer("p2")]);
    const battlefield = createZone("bf-p1", "battlefield", "p1", ["c1", "c2"]);
    seedZones(doc, [battlefield]);

    const denied = applyIntentToDoc(
      doc,
      {
        id: "intent-71",
        type: "zone.reorder",
        payload: {
          actorId: "p2",
          zoneId: battlefield.id,
          orderedCardIds: ["c2", "c1"],
        },
      },
      createEmptyHiddenState()
    );
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.error).toBe("Only zone owner may reorder cards");
    }
  });

  it("locks rooms only when issued by the host", () => {
    const doc = createDoc();
    seedPlayers(doc, [createPlayer("p1"), createPlayer("p2")]);
    doc.getMap("meta").set("hostId", "p1");

    const denied = applyIntentToDoc(
      doc,
      {
        id: "intent-29",
        type: "room.lock",
        payload: {
          actorId: "p2",
          locked: true,
        },
      },
      createEmptyHiddenState()
    );
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.error).toBe("Only host may lock the room");
    }

    const allowed = applyIntentToDoc(
      doc,
      {
        id: "intent-30",
        type: "room.lock",
        payload: {
          actorId: "p1",
          locked: true,
        },
      },
      createEmptyHiddenState()
    );
    expect(allowed.ok).toBe(true);
    expect(doc.getMap("meta").get("locked")).toBe(true);
  });

  it("sets battlefield scale for the requesting player only", () => {
    const doc = createDoc();
    seedPlayers(doc, [createPlayer("p1")]);

    const denied = applyIntentToDoc(
      doc,
      {
        id: "intent-31",
        type: "ui.battlefieldScale.set",
        payload: {
          actorId: "p2",
          playerId: "p1",
          scale: 0.75,
        },
      },
      createEmptyHiddenState()
    );
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.error).toBe("actor mismatch");
    }

    const allowed = applyIntentToDoc(
      doc,
      {
        id: "intent-32",
        type: "ui.battlefieldScale.set",
        payload: {
          actorId: "p1",
          playerId: "p1",
          scale: 2,
        },
      },
      createEmptyHiddenState()
    );
    expect(allowed.ok).toBe(true);
    expect(doc.getMap("battlefieldViewScale").get("p1")).toBe(1);
  });

  it("adds global counters once without logging creation", () => {
    const doc = createDoc();
    const hidden = createEmptyHiddenState();

    const added = applyIntentToDoc(
      doc,
      {
        id: "intent-33",
        type: "counter.global.add",
        payload: {
          actorId: "p1",
          counterType: "energy",
          color: "#00ff00",
        },
      },
      hidden
    );
    expect(added.ok).toBe(true);
    if (added.ok) {
      expect(added.logEvents).toHaveLength(0);
    }
    expect(doc.getMap("globalCounters").get("energy")).toBe("#00ff00");

    const duplicate = applyIntentToDoc(
      doc,
      {
        id: "intent-34",
        type: "counter.global.add",
        payload: {
          actorId: "p1",
          counterType: "energy",
          color: "#00ff00",
        },
      },
      hidden
    );
    expect(duplicate.ok).toBe(true);
    if (duplicate.ok) {
      expect(duplicate.logEvents).toHaveLength(0);
    }
  });

  it("adjusts card counters with logs", () => {
    const doc = createDoc();
    seedPlayers(doc, [createPlayer("p1")]);
    const battlefield = createZone("bf-p1", "battlefield", "p1", ["c1"]);
    seedZones(doc, [battlefield]);
    seedCards(doc, [createCard("c1", "p1", battlefield.id)]);

    const hidden = createEmptyHiddenState();

    const add = applyIntentToDoc(
      doc,
      {
        id: "intent-35",
        type: "card.counter.adjust",
        payload: {
          actorId: "p1",
          cardId: "c1",
          counter: { type: "+1/+1", count: 2 },
        },
      },
      hidden
    );
    expect(add.ok).toBe(true);
    if (add.ok) {
      expect(add.logEvents.map((event) => event.eventId)).toEqual([
        "counter.add",
      ]);
    }
    const card = doc.getMap("cards").get("c1") as Card;
    expect(card.counters[0]?.count).toBe(2);

    const remove = applyIntentToDoc(
      doc,
      {
        id: "intent-36",
        type: "card.counter.adjust",
        payload: {
          actorId: "p1",
          cardId: "c1",
          counterType: "+1/+1",
          delta: -1,
        },
      },
      hidden
    );
    expect(remove.ok).toBe(true);
    if (remove.ok) {
      expect(remove.logEvents.map((event) => event.eventId)).toEqual([
        "counter.remove",
      ]);
    }
  });

  it("taps cards only when controlled and untaps all for the actor", () => {
    const doc = createDoc();
    seedPlayers(doc, [createPlayer("p1"), createPlayer("p2")]);
    const battlefield = createZone("bf-p1", "battlefield", "p1", ["c1", "c2"]);
    seedZones(doc, [battlefield]);
    seedCards(doc, [
      createCard("c1", "p1", battlefield.id, { controllerId: "p1" }),
      createCard("c2", "p1", battlefield.id, {
        controllerId: "p2",
        tapped: true,
      }),
    ]);

    const hidden = createEmptyHiddenState();

    const denied = applyIntentToDoc(
      doc,
      {
        id: "intent-37",
        type: "card.tap",
        payload: {
          actorId: "p2",
          cardId: "c1",
          tapped: true,
        },
      },
      hidden
    );
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.error).toBe("Only controller may tap/untap");
    }

    const tapped = applyIntentToDoc(
      doc,
      {
        id: "intent-38",
        type: "card.tap",
        payload: {
          actorId: "p1",
          cardId: "c1",
          tapped: true,
        },
      },
      hidden
    );
    expect(tapped.ok).toBe(true);
    if (tapped.ok) {
      expect(tapped.logEvents.map((event) => event.eventId)).toEqual([
        "card.tap",
      ]);
    }
    const card = doc.getMap("cards").get("c1") as Card;
    expect(card.tapped).toBe(true);

    const mismatch = applyIntentToDoc(
      doc,
      {
        id: "intent-39",
        type: "card.untapAll",
        payload: {
          actorId: "p2",
          playerId: "p1",
        },
      },
      hidden
    );
    expect(mismatch.ok).toBe(false);
    if (!mismatch.ok) {
      expect(mismatch.error).toBe("actor mismatch");
    }

    const untap = applyIntentToDoc(
      doc,
      {
        id: "intent-40",
        type: "card.untapAll",
        payload: {
          actorId: "p1",
          playerId: "p1",
        },
      },
      hidden
    );
    expect(untap.ok).toBe(true);
    const updated = doc.getMap("cards").get("c1") as Card;
    const other = doc.getMap("cards").get("c2") as Card;
    expect(updated.tapped).toBe(false);
    expect(other.tapped).toBe(true);
  });

  it("adds cards to hidden zones and face-down battlefields", () => {
    const doc = createDoc();
    seedPlayers(doc, [createPlayer("p1")]);
    const hand = createZone("hand-p1", "hand", "p1");
    const battlefield = createZone("bf-p1", "battlefield", "p1");
    seedZones(doc, [hand, battlefield]);

    const hidden = createEmptyHiddenState();

    const handAdd = applyIntentToDoc(
      doc,
      {
        id: "intent-41",
        type: "card.add",
        payload: {
          actorId: "p1",
          card: createCard("h1", "p1", hand.id),
        },
      },
      hidden
    );
    expect(handAdd.ok).toBe(true);
    expect(hidden.handOrder.p1).toEqual(["h1"]);
    expect(doc.getMap("cards").get("h1")).toBeUndefined();

    const faceDownAdd = applyIntentToDoc(
      doc,
      {
        id: "intent-42",
        type: "card.add",
        payload: {
          actorId: "p1",
          card: createCard("fd1", "p1", battlefield.id, { faceDown: true }),
        },
      },
      hidden
    );
    expect(faceDownAdd.ok).toBe(true);
    const publicCard = doc.getMap("cards").get("fd1") as Card;
    expect(publicCard.name).toBe("Card");
    expect(hidden.faceDownBattlefield.fd1?.name).toBe("Card fd1");
  });

  it("denies adding tokens outside the battlefield", () => {
    const doc = createDoc();
    seedPlayers(doc, [createPlayer("p1")]);
    const hand = createZone("hand-p1", "hand", "p1");
    seedZones(doc, [hand]);

    const denied = applyIntentToDoc(
      doc,
      {
        id: "intent-41b",
        type: "card.add",
        payload: {
          actorId: "p1",
          card: createCard("t1", "p1", hand.id, { isToken: true }),
        },
      },
      createEmptyHiddenState()
    );

    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.error).toBe("Tokens can only enter the battlefield");
    }
  });

  it("denies adding cards to hidden zones for non-owners", () => {
    const doc = createDoc();
    seedPlayers(doc, [createPlayer("p1"), createPlayer("p2")]);
    const hand = createZone("hand-p1", "hand", "p1");
    seedZones(doc, [hand]);

    const denied = applyIntentToDoc(
      doc,
      {
        id: "intent-47",
        type: "card.add",
        payload: {
          actorId: "p2",
          card: createCard("h1", "p1", hand.id),
        },
      },
      createEmptyHiddenState()
    );
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.error).toBe(
        "Cannot place into a hidden zone you do not own"
      );
    }
  });

  it("logs token creation and removal", () => {
    const doc = createDoc();
    seedPlayers(doc, [createPlayer("p1")]);
    const battlefield = createZone("bf-p1", "battlefield", "p1");
    seedZones(doc, [battlefield]);
    const hidden = createEmptyHiddenState();

    const created = applyIntentToDoc(
      doc,
      {
        id: "intent-43",
        type: "card.add",
        payload: {
          actorId: "p1",
          card: createCard("t1", "p1", battlefield.id, { isToken: true }),
        },
      },
      hidden
    );
    expect(created.ok).toBe(true);
    if (created.ok) {
      expect(created.logEvents.map((event) => event.eventId)).toEqual([
        "card.tokenCreate",
      ]);
    }

    const removed = applyIntentToDoc(
      doc,
      {
        id: "intent-44",
        type: "card.remove",
        payload: {
          actorId: "p1",
          cardId: "t1",
        },
      },
      hidden
    );
    expect(removed.ok).toBe(true);
    if (removed.ok) {
      expect(removed.logEvents.map((event) => event.eventId)).toEqual([
        "card.remove",
      ]);
    }
    expect(doc.getMap("cards").get("t1")).toBeUndefined();

    const deniedMissing = applyIntentToDoc(
      doc,
      {
        id: "intent-45",
        type: "card.remove",
        payload: {
          actorId: "p1",
          cardId: "non-token",
        },
      },
      hidden
    );
    expect(deniedMissing.ok).toBe(false);

    seedCards(doc, [createCard("c1", "p1", battlefield.id)]);
    const deniedNonToken = applyIntentToDoc(
      doc,
      {
        id: "intent-46",
        type: "card.remove",
        payload: {
          actorId: "p1",
          cardId: "c1",
        },
      },
      hidden
    );
    expect(deniedNonToken.ok).toBe(false);
    if (!deniedNonToken.ok) {
      expect(deniedNonToken.error).toBe(
        "Direct remove is allowed only for tokens"
      );
    }
  });

  it("updates card state with permission checks and face-down handling", () => {
    const doc = createDoc();
    seedPlayers(doc, [createPlayer("p1"), createPlayer("p2")]);
    const battlefield = createZone("bf-p1", "battlefield", "p1", ["c1"]);
    seedZones(doc, [battlefield]);
    seedCards(doc, [
      createCard("c1", "p1", battlefield.id, { controllerId: "p1" }),
    ]);
    const hidden = createEmptyHiddenState();

    const forbidden = applyIntentToDoc(
      doc,
      {
        id: "intent-46",
        type: "card.update",
        payload: {
          actorId: "p1",
          cardId: "c1",
          updates: { zoneId: "other" },
        },
      },
      hidden
    );
    expect(forbidden.ok).toBe(false);
    if (!forbidden.ok) {
      expect(forbidden.error).toBe("unsupported update");
    }

    const forbiddenVisibility = applyIntentToDoc(
      doc,
      {
        id: "intent-46b",
        type: "card.update",
        payload: {
          actorId: "p1",
          cardId: "c1",
          updates: { knownToAll: true },
        },
      },
      hidden
    );
    expect(forbiddenVisibility.ok).toBe(false);
    if (!forbiddenVisibility.ok) {
      expect(forbiddenVisibility.error).toBe("unsupported update");
    }

    const denied = applyIntentToDoc(
      doc,
      {
        id: "intent-47",
        type: "card.update",
        payload: {
          actorId: "p2",
          cardId: "c1",
          updates: { power: "4" },
        },
      },
      hidden
    );
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.error).toBe("Only controller may modify this card");
    }

    const faceDown = applyIntentToDoc(
      doc,
      {
        id: "intent-48",
        type: "card.update",
        payload: {
          actorId: "p1",
          cardId: "c1",
          updates: { faceDown: true },
        },
      },
      hidden
    );
    expect(faceDown.ok).toBe(true);
    const publicFaceDown = doc.getMap("cards").get("c1") as Card;
    expect(publicFaceDown.name).toBe("Card");
    expect(hidden.faceDownBattlefield.c1?.name).toBe("Card c1");

    const faceUp = applyIntentToDoc(
      doc,
      {
        id: "intent-49",
        type: "card.update",
        payload: {
          actorId: "p1",
          cardId: "c1",
          updates: { faceDown: false },
        },
      },
      hidden
    );
    expect(faceUp.ok).toBe(true);
    const publicFaceUp = doc.getMap("cards").get("c1") as Card;
    expect(publicFaceUp.name).toBe("Card c1");
    expect(hidden.faceDownBattlefield.c1).toBeUndefined();

    const commanderDenied = applyIntentToDoc(
      doc,
      {
        id: "intent-50",
        type: "card.update",
        payload: {
          actorId: "p2",
          cardId: "c1",
          updates: { commanderTax: 2 },
        },
      },
      hidden
    );
    expect(commanderDenied.ok).toBe(false);
    if (!commanderDenied.ok) {
      expect(commanderDenied.error).toBe("Only owner may update commander tax");
    }

    const commanderUpdate = applyIntentToDoc(
      doc,
      {
        id: "intent-51",
        type: "card.update",
        payload: {
          actorId: "p1",
          cardId: "c1",
          updates: { commanderTax: 2 },
        },
      },
      hidden
    );
    expect(commanderUpdate.ok).toBe(true);
    if (commanderUpdate.ok) {
      expect(commanderUpdate.logEvents.map((event) => event.eventId)).toEqual([
        "player.commanderTax",
      ]);
    }
  });

  it("transforms and duplicates cards with logs", () => {
    const doc = createDoc();
    seedPlayers(doc, [createPlayer("p1")]);
    const battlefield = createZone("bf-p1", "battlefield", "p1", ["c1"]);
    seedZones(doc, [battlefield]);
    seedCards(doc, [
      createCard("c1", "p1", battlefield.id, {
        scryfall: {
          card_faces: [{ name: "Front" }, { name: "Back" }],
        },
      } as Card),
    ]);

    const hidden = createEmptyHiddenState();

    const transform = applyIntentToDoc(
      doc,
      {
        id: "intent-52",
        type: "card.transform",
        payload: {
          actorId: "p1",
          cardId: "c1",
          targetIndex: 1,
        },
      },
      hidden
    );
    expect(transform.ok).toBe(true);
    if (transform.ok) {
      expect(transform.logEvents.map((event) => event.eventId)).toEqual([
        "card.transform",
      ]);
    }

    const duplicate = applyIntentToDoc(
      doc,
      {
        id: "intent-53",
        type: "card.duplicate",
        payload: {
          actorId: "p1",
          cardId: "c1",
          newCardId: "c1-copy",
        },
      },
      hidden
    );
    expect(duplicate.ok).toBe(true);
    const clone = doc.getMap("cards").get("c1-copy") as Card;
    expect(clone.isToken).toBe(true);
  });

  it("moves cards to the bottom placement and denies hidden draws for non-owners", () => {
    const doc = createDoc();
    seedPlayers(doc, [createPlayer("p1"), createPlayer("p2")]);
    const battlefield = createZone("bf-p1", "battlefield", "p1", ["c1", "c2"]);
    const library = createZone("lib-p1", "library", "p1");
    const hand = createZone("hand-p1", "hand", "p1");
    seedZones(doc, [battlefield, library, hand]);
    seedCards(doc, [
      createCard("c1", "p1", battlefield.id),
      createCard("c2", "p1", battlefield.id),
    ]);
    const hidden = createEmptyHiddenState();

    const moveBottom = applyIntentToDoc(
      doc,
      {
        id: "intent-54",
        type: "card.move",
        payload: {
          actorId: "p1",
          cardId: "c2",
          toZoneId: battlefield.id,
          placement: "bottom",
        },
      },
      hidden
    );
    expect(moveBottom.ok).toBe(true);
    const battlefieldZone = doc.getMap("zones").get(battlefield.id) as Zone;
    expect(battlefieldZone.cardIds[0]).toBe("c2");

    const denied = applyIntentToDoc(
      doc,
      {
        id: "intent-55",
        type: "library.draw",
        payload: {
          actorId: "p2",
          playerId: "p1",
          count: 1,
        },
      },
      hidden
    );
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.error).toBe("Hidden zone");
    }
  });

  it("denies moving cards into another player's command zone", () => {
    const doc = createDoc();
    seedPlayers(doc, [createPlayer("p1"), createPlayer("p2")]);
    const battlefield = createZone("bf-p1", "battlefield", "p1", ["c1"]);
    const commander = createZone("cmd-p1", "commander", "p1");
    seedZones(doc, [battlefield, commander]);
    seedCards(doc, [createCard("c1", "p1", battlefield.id)]);

    const denied = applyIntentToDoc(
      doc,
      {
        id: "intent-72",
        type: "card.move",
        payload: {
          actorId: "p2",
          cardId: "c1",
          toZoneId: commander.id,
        },
      },
      createEmptyHiddenState()
    );
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.error).toBe(
        "Cannot place cards into another player's command zone"
      );
    }
  });

  it("handles library view permissions and dice roll validation", () => {
    const doc = createDoc();
    seedPlayers(doc, [createPlayer("p1"), createPlayer("p2")]);
    const library = createZone("lib-p1", "library", "p1");
    seedZones(doc, [library]);
    const hidden = createEmptyHiddenState();

    const denied = applyIntentToDoc(
      doc,
      {
        id: "intent-56",
        type: "library.view",
        payload: {
          actorId: "p2",
          playerId: "p1",
          count: 1,
        },
      },
      hidden
    );
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.error).toBe("Hidden zone");
    }

    const validFlip = applyIntentToDoc(
      doc,
      {
        id: "intent-57",
        type: "coin.flip",
        payload: {
          actorId: "p1",
          count: 2,
          results: ["heads", "tails"],
        },
      },
      hidden
    );
    expect(validFlip.ok).toBe(true);
    if (validFlip.ok) {
      expect(validFlip.logEvents.map((event) => event.eventId)).toEqual([
        "coin.flip",
      ]);
    }

    const invalidFlip = applyIntentToDoc(
      doc,
      {
        id: "intent-58",
        type: "coin.flip",
        payload: {
          actorId: "p1",
          count: 2,
        },
      },
      hidden
    );
    expect(invalidFlip.ok).toBe(false);
    if (!invalidFlip.ok) {
      expect(invalidFlip.error).toBe("invalid coin flip");
    }

    const validRoll = applyIntentToDoc(
      doc,
      {
        id: "intent-59",
        type: "dice.roll",
        payload: {
          actorId: "p1",
          sides: 6,
          count: 2,
          results: [1, 6],
        },
      },
      hidden
    );
    expect(validRoll.ok).toBe(true);
    if (validRoll.ok) {
      expect(validRoll.logEvents.map((event) => event.eventId)).toEqual([
        "dice.roll",
      ]);
    }

    const invalidRoll = applyIntentToDoc(
      doc,
      {
        id: "intent-60",
        type: "dice.roll",
        payload: {
          actorId: "p1",
          sides: 6,
          count: 2,
        },
      },
      hidden
    );
    expect(invalidRoll.ok).toBe(false);
    if (!invalidRoll.ok) {
      expect(invalidRoll.error).toBe("invalid dice roll");
    }
  });

  it("updates player names only for the owner and rejects mismatched leaves", () => {
    const doc = createDoc();
    seedPlayers(doc, [createPlayer("p1"), createPlayer("p2")]);

    const deniedName = applyIntentToDoc(
      doc,
      {
        id: "intent-59",
        type: "player.update",
        payload: {
          actorId: "p2",
          playerId: "p1",
          updates: { name: "Nope" },
        },
      },
      createEmptyHiddenState()
    );
    expect(deniedName.ok).toBe(false);
    if (!deniedName.ok) {
      expect(deniedName.error).toBe("Cannot change another player's name");
    }

    const allowedName = applyIntentToDoc(
      doc,
      {
        id: "intent-60",
        type: "player.update",
        payload: {
          actorId: "p1",
          playerId: "p1",
          updates: { name: "New Name" },
        },
      },
      createEmptyHiddenState()
    );
    expect(allowedName.ok).toBe(true);
    const player = doc.getMap("players").get("p1") as Player;
    expect(player.name).toBe("New Name");

    const leaveFallback = applyIntentToDoc(
      doc,
      {
        id: "intent-61",
        type: "player.leave",
        payload: {
          actorId: "p2",
          playerId: "p1",
        },
      },
      createEmptyHiddenState()
    );
    expect(leaveFallback.ok).toBe(true);
    const remainingPlayers = doc.getMap("players");
    expect(remainingPlayers.get("p1")).toBeTruthy();
    expect(remainingPlayers.get("p2")).toBeUndefined();
  });

  it("keeps existing zones when re-adding with the same owner/type", () => {
    const doc = createDoc();
    seedPlayers(doc, [createPlayer("p1")]);
    const zone = createZone("hand-p1", "hand", "p1", ["h1"]);
    seedZones(doc, [zone]);

    const result = applyIntentToDoc(
      doc,
      {
        id: "intent-62",
        type: "zone.add",
        payload: {
          actorId: "p1",
          zone: createZone("hand-p1", "hand", "p1", ["h2"]),
        },
      },
      createEmptyHiddenState()
    );
    expect(result.ok).toBe(true);
    const stored = doc.getMap("zones").get("hand-p1") as Zone;
    expect(stored.cardIds).toEqual(["h1"]);
  });

  it("reorders hidden library zones and keeps counts in sync", () => {
    const doc = createDoc();
    seedPlayers(doc, [createPlayer("p1")]);
    const library = createZone("lib-p1", "library", "p1");
    seedZones(doc, [library]);

    const hidden = createEmptyHiddenState();
    hidden.libraryOrder = { p1: ["l1", "l2"] };
    hidden.cards = {
      l1: createCard("l1", "p1", library.id),
      l2: createCard("l2", "p1", library.id),
    };

    const result = applyIntentToDoc(
      doc,
      {
        id: "intent-63",
        type: "zone.reorder",
        payload: {
          actorId: "p1",
          zoneId: library.id,
          orderedCardIds: ["l2", "l1"],
        },
      },
      hidden
    );
    expect(result.ok).toBe(true);
    expect(hidden.libraryOrder.p1).toEqual(["l2", "l1"]);
    const player = doc.getMap("players").get("p1") as Player;
    expect(player.libraryCount).toBe(2);
  });

  it("updates power/toughness with logs and enforces duplicate permissions", () => {
    const doc = createDoc();
    seedPlayers(doc, [createPlayer("p1"), createPlayer("p2")]);
    const battlefield = createZone("bf-p1", "battlefield", "p1", ["c1"]);
    seedZones(doc, [battlefield]);
    seedCards(doc, [
      createCard("c1", "p1", battlefield.id, { controllerId: "p1" }),
    ]);
    const hidden = createEmptyHiddenState();

    const ptUpdate = applyIntentToDoc(
      doc,
      {
        id: "intent-64",
        type: "card.update",
        payload: {
          actorId: "p1",
          cardId: "c1",
          updates: { power: "4", toughness: "4" },
        },
      },
      hidden
    );
    expect(ptUpdate.ok).toBe(true);
    if (ptUpdate.ok) {
      expect(ptUpdate.logEvents.map((event) => event.eventId)).toEqual([
        "card.pt",
      ]);
    }

    const dupDenied = applyIntentToDoc(
      doc,
      {
        id: "intent-65",
        type: "card.duplicate",
        payload: {
          actorId: "p2",
          cardId: "c1",
          newCardId: "c1-copy-2",
        },
      },
      hidden
    );
    expect(dupDenied.ok).toBe(false);
    if (!dupDenied.ok) {
      expect(dupDenied.error).toBe("Only controller may modify this card");
    }
  });

  it("adds cards directly to library order and removes hidden tokens", () => {
    const doc = createDoc();
    seedPlayers(doc, [createPlayer("p1")]);
    const library = createZone("lib-p1", "library", "p1");
    seedZones(doc, [library]);
    const hidden = createEmptyHiddenState();

    const add = applyIntentToDoc(
      doc,
      {
        id: "intent-66",
        type: "card.add",
        payload: {
          actorId: "p1",
          card: createCard("l1", "p1", library.id),
        },
      },
      hidden
    );
    expect(add.ok).toBe(true);
    expect(hidden.libraryOrder.p1).toEqual(["l1"]);
    const player = doc.getMap("players").get("p1") as Player;
    expect(player.libraryCount).toBe(1);

    hidden.cards.t1 = createCard("t1", "p1", library.id, { isToken: true });
    hidden.libraryOrder.p1 = ["l1", "t1"];
    const removed = applyIntentToDoc(
      doc,
      {
        id: "intent-67",
        type: "card.remove",
        payload: {
          actorId: "p1",
          cardId: "t1",
        },
      },
      hidden
    );
    expect(removed.ok).toBe(true);
    expect(hidden.cards.t1).toBeUndefined();
    expect(hidden.libraryOrder.p1).toEqual(["l1"]);
  });

  it("enforces commander zone and token move restrictions", () => {
    const doc = createDoc();
    seedPlayers(doc, [createPlayer("p1"), createPlayer("p2")]);
    const commander = createZone("cmd-p1", "commander", "p1");
    const battlefield = createZone("bf-p1", "battlefield", "p1", ["t1"]);
    const graveyard = createZone("gy-p1", "graveyard", "p1");
    seedZones(doc, [commander, battlefield, graveyard]);
    seedCards(doc, [createCard("t1", "p1", battlefield.id, { isToken: true })]);
    const hidden = createEmptyHiddenState();

    const commanderDenied = applyIntentToDoc(
      doc,
      {
        id: "intent-68",
        type: "card.move",
        payload: {
          actorId: "p2",
          cardId: "t1",
          toZoneId: commander.id,
        },
      },
      hidden
    );
    expect(commanderDenied.ok).toBe(false);
    if (!commanderDenied.ok) {
      expect(commanderDenied.error).toBe(
        "Cannot place cards into another player's command zone"
      );
    }

    const tokenDenied = applyIntentToDoc(
      doc,
      {
        id: "intent-69",
        type: "card.move",
        payload: {
          actorId: "p2",
          cardId: "t1",
          toZoneId: graveyard.id,
        },
      },
      hidden
    );
    expect(tokenDenied.ok).toBe(false);
    if (!tokenDenied.ok) {
      expect(tokenDenied.error).toBe(
        "Only owner may move this token off the battlefield"
      );
    }
  });

  it("denies deck unload for non-owners", () => {
    const doc = createDoc();
    seedPlayers(doc, [createPlayer("p1"), createPlayer("p2")]);
    const library = createZone("lib-p1", "library", "p1");
    seedZones(doc, [library]);
    const hidden = createEmptyHiddenState();

    const denied = applyIntentToDoc(
      doc,
      {
        id: "intent-70",
        type: "deck.unload",
        payload: {
          actorId: "p2",
          playerId: "p1",
        },
      },
      hidden
    );
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.error).toBe("Hidden zone");
    }
  });

  it("loads decks only for the matching actor", () => {
    const doc = createDoc();
    seedPlayers(doc, [createPlayer("p1"), createPlayer("p2")]);

    const hidden = createEmptyHiddenState();

    const denied = applyIntentToDoc(
      doc,
      {
        id: "intent-10",
        type: "deck.load",
        payload: {
          actorId: "p2",
          playerId: "p1",
        },
      },
      hidden
    );

    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.error).toBe("actor mismatch");
    }

    const allowed = applyIntentToDoc(
      doc,
      {
        id: "intent-11",
        type: "deck.load",
        payload: {
          actorId: "p1",
          playerId: "p1",
        },
      },
      hidden
    );

    expect(allowed.ok).toBe(true);
    if (allowed.ok) {
      expect(allowed.logEvents).toHaveLength(0);
    }
    const player = doc.getMap("players").get("p1") as Player;
    expect(player.deckLoaded).toBe(true);
  });

  it("resets decks by clearing zones, reveals, and top reveal state", () => {
    const doc = createDoc();
    seedPlayers(doc, [
      createPlayer("p1", { libraryTopReveal: "all", deckLoaded: true }),
    ]);
    const library = createZone("library-p1", "library", "p1");
    const hand = createZone("hand-p1", "hand", "p1");
    const sideboard = createZone("sideboard-p1", "sideboard", "p1");
    const battlefield = createZone("battlefield-p1", "battlefield", "p1", [
      "cPublic",
    ]);
    seedZones(doc, [library, hand, sideboard, battlefield]);

    seedCards(doc, [
      createCard("cPublic", "p1", battlefield.id, { knownToAll: true }),
    ]);

    const hidden = createEmptyHiddenState();
    hidden.handOrder = { p1: ["h1"] };
    hidden.libraryOrder = { p1: ["l1"] };
    hidden.sideboardOrder = { p1: ["s1"] };
    hidden.cards = {
      h1: createCard("h1", "p1", hand.id),
      l1: createCard("l1", "p1", library.id),
      s1: createCard("s1", "p1", sideboard.id),
    };
    hidden.handReveals = { h1: { toAll: true } };
    hidden.libraryReveals = { l1: { toAll: true } };
    const handRevealsToAll = doc.getMap("handRevealsToAll");
    handRevealsToAll.set("h1", { name: "Card h1" });
    const libraryRevealsToAll = doc.getMap("libraryRevealsToAll");
    libraryRevealsToAll.set("l1", {
      card: { name: "Card l1" },
      orderKey: "k1",
    });

    const result = applyIntentToDoc(
      doc,
      {
        id: "intent-10",
        type: "deck.reset",
        payload: {
          actorId: "p1",
          playerId: "p1",
        },
      },
      hidden
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.logEvents.map((event) => event.eventId)).toEqual([
        "deck.reset",
      ]);
    }
    const zonesMap = doc.getMap("zones");
    expect((zonesMap.get(hand.id) as Zone).cardIds).toEqual([]);
    expect((zonesMap.get(library.id) as Zone).cardIds).toEqual([]);
    expect((zonesMap.get(sideboard.id) as Zone).cardIds).toEqual([]);
    expect((zonesMap.get(battlefield.id) as Zone).cardIds).toEqual([]);
    expect(doc.getMap("cards").get("cPublic")).toBeUndefined();
    expect(hidden.handOrder.p1).toEqual([]);
    expectSameMembers(hidden.libraryOrder.p1, ["h1", "l1", "cPublic"]);
    expectSameMembers(hidden.sideboardOrder.p1 ?? [], ["s1"]);
    expect(hidden.handReveals.h1).toBeUndefined();
    expect(hidden.libraryReveals.l1).toBeUndefined();
    expect(handRevealsToAll.size).toBe(0);
    expect(libraryRevealsToAll.size).toBe(0);
    expect(hidden.cards.cPublic?.knownToAll).toBe(false);
    const player = doc.getMap("players").get("p1") as Player;
    expect(player.libraryTopReveal).toBeUndefined();
  });

  it("keeps commanders in the commander zone and removes tokens on reset", () => {
    const doc = createDoc();
    seedPlayers(doc, [createPlayer("p1")]);
    const library = createZone("library-p1", "library", "p1");
    const hand = createZone("hand-p1", "hand", "p1");
    const commander = createZone("commander-p1", "commander", "p1");
    const battlefield = createZone("battlefield-p1", "battlefield", "p1", [
      "cmd1",
      "token1",
    ]);
    seedZones(doc, [library, hand, commander, battlefield]);

    seedCards(doc, [
      createCard("cmd1", "p1", battlefield.id, { isCommander: true }),
      createCard("token1", "p1", battlefield.id, { isToken: true }),
    ]);

    const hidden = createEmptyHiddenState();

    const result = applyIntentToDoc(
      doc,
      {
        id: "intent-12",
        type: "deck.reset",
        payload: {
          actorId: "p1",
          playerId: "p1",
        },
      },
      hidden
    );

    expect(result.ok).toBe(true);
    const zonesMap = doc.getMap("zones");
    const commanderZone = zonesMap.get(commander.id) as Zone;
    expect(commanderZone.cardIds).toEqual(["cmd1"]);
    const commanderCard = doc.getMap("cards").get("cmd1") as Card;
    expect(commanderCard.zoneId).toBe(commander.id);
    expect(commanderCard.isCommander).toBe(true);
    expect(commanderCard.knownToAll).toBe(true);
    const battlefieldZone = zonesMap.get(battlefield.id) as Zone;
    expect(battlefieldZone.cardIds).toEqual([]);
    expect(doc.getMap("cards").get("token1")).toBeUndefined();
    expect(hidden.cards.cmd1).toBeUndefined();
    expect(hidden.cards.token1).toBeUndefined();
  });

  it("unloads decks by removing all cards and clearing flags", () => {
    const doc = createDoc();
    seedPlayers(doc, [
      createPlayer("p1", { libraryTopReveal: "self", deckLoaded: true }),
    ]);
    const library = createZone("library-p1", "library", "p1");
    const hand = createZone("hand-p1", "hand", "p1");
    const sideboard = createZone("sideboard-p1", "sideboard", "p1");
    const battlefield = createZone("battlefield-p1", "battlefield", "p1", [
      "cPublic",
    ]);
    seedZones(doc, [library, hand, sideboard, battlefield]);
    seedCards(doc, [createCard("cPublic", "p1", battlefield.id)]);

    const hidden = createEmptyHiddenState();
    hidden.handOrder = { p1: ["h1"] };
    hidden.libraryOrder = { p1: ["l1"] };
    hidden.sideboardOrder = { p1: ["s1"] };
    hidden.cards = {
      h1: createCard("h1", "p1", hand.id),
      l1: createCard("l1", "p1", library.id),
      s1: createCard("s1", "p1", sideboard.id),
    };

    const result = applyIntentToDoc(
      doc,
      {
        id: "intent-11",
        type: "deck.unload",
        payload: {
          actorId: "p1",
          playerId: "p1",
        },
      },
      hidden
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.logEvents.map((event) => event.eventId)).toEqual([
        "deck.unload",
      ]);
    }
    expect(doc.getMap("cards").size).toBe(0);
    expect(hidden.cards.h1).toBeUndefined();
    expect(hidden.cards.l1).toBeUndefined();
    expect(hidden.cards.s1).toBeUndefined();
    expect(hidden.handOrder.p1).toEqual([]);
    expect(hidden.libraryOrder.p1).toEqual([]);
    expect(hidden.sideboardOrder.p1).toEqual([]);
    const player = doc.getMap("players").get("p1") as Player;
    expect(player.deckLoaded).toBe(false);
    expect(player.libraryTopReveal).toBeUndefined();
  });

  it("denies deck reset for non-owners", () => {
    const doc = createDoc();
    seedPlayers(doc, [createPlayer("p1"), createPlayer("p2")]);
    const library = createZone("library-p1", "library", "p1");
    seedZones(doc, [library]);

    const hidden = createEmptyHiddenState();
    hidden.libraryOrder = { p1: ["l1"] };
    hidden.cards = { l1: createCard("l1", "p1", library.id) };

    const result = applyIntentToDoc(
      doc,
      {
        id: "intent-13",
        type: "deck.reset",
        payload: {
          actorId: "p2",
          playerId: "p1",
        },
      },
      hidden
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Hidden zone");
    }
  });

  it("mulligan draws the requested count and logs reset/draw", () => {
    const doc = createDoc();
    seedPlayers(doc, [createPlayer("p1")]);
    const library = createZone("library-p1", "library", "p1");
    const hand = createZone("hand-p1", "hand", "p1");
    seedZones(doc, [library, hand]);

    const hidden = createEmptyHiddenState();
    hidden.libraryOrder = { p1: ["l1", "l2", "l3", "l4"] };
    hidden.handOrder = { p1: ["h1", "h2"] };
    hidden.cards = {
      l1: createCard("l1", "p1", library.id),
      l2: createCard("l2", "p1", library.id),
      l3: createCard("l3", "p1", library.id),
      l4: createCard("l4", "p1", library.id),
      h1: createCard("h1", "p1", hand.id),
      h2: createCard("h2", "p1", hand.id),
    };

    const result = applyIntentToDoc(
      doc,
      {
        id: "intent-12",
        type: "deck.mulligan",
        payload: {
          actorId: "p1",
          playerId: "p1",
          count: 3,
        },
      },
      hidden
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.logEvents.map((event) => event.eventId)).toEqual([
        "deck.reset",
        "card.draw",
      ]);
      expect(result.logEvents[1]?.payload).toMatchObject({
        actorId: "p1",
        playerId: "p1",
        count: 3,
      });
    }
    expect(hidden.handOrder.p1).toHaveLength(3);
    expect(hidden.libraryOrder.p1).toHaveLength(3);
    expectSameMembers(
      [...hidden.handOrder.p1, ...hidden.libraryOrder.p1],
      ["l1", "l2", "l3", "l4", "h1", "h2"]
    );
    hidden.handOrder.p1.forEach((id) => {
      expect(hidden.cards[id]?.zoneId).toBe(hand.id);
    });
    hidden.libraryOrder.p1.forEach((id) => {
      expect(hidden.cards[id]?.zoneId).toBe(library.id);
    });
    const handZone = doc.getMap("zones").get(hand.id) as Zone;
    expectSameMembers(handZone.cardIds, hidden.handOrder.p1);
    const libraryZone = doc.getMap("zones").get(library.id) as Zone;
    expect(libraryZone.cardIds).toEqual([]);
  });

  it("denies mulligan for non-owners", () => {
    const doc = createDoc();
    seedPlayers(doc, [createPlayer("p1"), createPlayer("p2")]);
    const library = createZone("library-p1", "library", "p1");
    const hand = createZone("hand-p1", "hand", "p1");
    seedZones(doc, [library, hand]);

    const hidden = createEmptyHiddenState();
    hidden.libraryOrder = { p1: ["l1"] };
    hidden.cards = { l1: createCard("l1", "p1", library.id) };

    const result = applyIntentToDoc(
      doc,
      {
        id: "intent-14",
        type: "deck.mulligan",
        payload: {
          actorId: "p2",
          playerId: "p1",
          count: 1,
        },
      },
      hidden
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Hidden zone");
    }
  });

  it("preserves known-to-all hand identity but hides identity in library", () => {
    const doc = createDoc();
    seedPlayers(doc, [createPlayer("p1")]);
    const battlefield = createZone("battlefield-p1", "battlefield", "p1", [
      "c1",
    ]);
    const hand = createZone("hand-p1", "hand", "p1");
    const library = createZone("library-p1", "library", "p1");
    seedZones(doc, [battlefield, hand, library]);

    seedCards(doc, [
      createCard("c1", "p1", battlefield.id, {
        knownToAll: true,
      }),
    ]);

    const hidden = createEmptyHiddenState();
    hidden.handOrder = { p1: [] };
    hidden.libraryOrder = { p1: [] };

    const toHand = applyIntentToDoc(
      doc,
      {
        id: "intent-3",
        type: "card.move",
        payload: {
          actorId: "p1",
          cardId: "c1",
          toZoneId: hand.id,
        },
      },
      hidden
    );

    expect(toHand.ok).toBe(true);
    expect(hidden.handReveals.c1?.toAll).toBe(true);

    const toLibrary = applyIntentToDoc(
      doc,
      {
        id: "intent-4",
        type: "card.move",
        payload: {
          actorId: "p1",
          cardId: "c1",
          toZoneId: library.id,
        },
      },
      hidden
    );

    expect(toLibrary.ok).toBe(true);
    expect(hidden.cards.c1?.knownToAll).toBe(false);
    expect(hidden.libraryReveals.c1).toBeUndefined();
  });
});
