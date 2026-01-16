import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import type { Card } from "../../../web/src/types/cards";
import type { Player } from "../../../web/src/types/players";
import type { Zone } from "../../../web/src/types/zones";
import { ZONE } from "../constants";
import { createEmptyHiddenState } from "../hiddenState";
import { applyMulligan, applyUnloadDeck } from "../deck";
import { getMaps, readPlayer, readZone, writeCard, writePlayer, writeZone } from "../yjsStore";

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

const makeCard = (id: string, ownerId: string, zoneId: string): Card => ({
  id,
  name: `Card ${id}`,
  ownerId,
  controllerId: ownerId,
  zoneId,
  tapped: false,
  faceDown: false,
  position: { x: 0.1, y: 0.2 },
  rotation: 0,
  counters: [],
});

describe("deck helpers", () => {
  it("should unload a player's deck and clear hidden/public state", () => {
    const doc = createDoc();
    const maps = getMaps(doc);
    const hidden = createEmptyHiddenState();

    writePlayer(maps, makePlayer("p1", { deckLoaded: true, libraryTopReveal: "all" }));
    writePlayer(maps, makePlayer("p2"));

    const library = makeZone("lib-p1", ZONE.LIBRARY, "p1", ["c1"]);
    const hand = makeZone("hand-p1", ZONE.HAND, "p1", ["c2"]);
    const sideboard = makeZone("sb-p1", ZONE.SIDEBOARD, "p1", ["c3"]);
    const oppLibrary = makeZone("lib-p2", ZONE.LIBRARY, "p2", ["o1"]);
    writeZone(maps, library);
    writeZone(maps, hand);
    writeZone(maps, sideboard);
    writeZone(maps, oppLibrary);

    writeCard(maps, makeCard("c1", "p1", library.id));
    writeCard(maps, makeCard("c2", "p1", hand.id));
    writeCard(maps, makeCard("c3", "p1", sideboard.id));
    writeCard(maps, makeCard("o1", "p2", oppLibrary.id));

    hidden.libraryOrder.p1 = ["h1"];
    hidden.handOrder.p1 = ["h2"];
    hidden.sideboardOrder.p1 = ["h3"];
    hidden.cards.h1 = makeCard("h1", "p1", library.id);
    hidden.cards.h2 = makeCard("h2", "p1", hand.id);
    hidden.cards.h3 = makeCard("h3", "p1", sideboard.id);
    maps.libraryRevealsToAll.set("h1", { ownerId: "p1" });
    maps.handRevealsToAll.set("h2", { ownerId: "p1" });

    applyUnloadDeck(maps, hidden, "p1");

    expect(maps.cards.get("c1")).toBeUndefined();
    expect(maps.cards.get("c2")).toBeUndefined();
    expect(maps.cards.get("c3")).toBeUndefined();
    expect(maps.cards.get("o1")).toBeTruthy();

    expect(hidden.cards.h1).toBeUndefined();
    expect(hidden.cards.h2).toBeUndefined();
    expect(hidden.cards.h3).toBeUndefined();
    expect(hidden.libraryOrder.p1).toEqual([]);
    expect(hidden.handOrder.p1).toEqual([]);
    expect(hidden.sideboardOrder.p1).toEqual([]);

    expect(maps.libraryRevealsToAll.get("h1")).toBeUndefined();
    expect(maps.handRevealsToAll.get("h2")).toBeUndefined();

    expect(readZone(maps, library.id)?.cardIds).toEqual([]);
    expect(readZone(maps, hand.id)?.cardIds).toEqual([]);
    expect(readZone(maps, sideboard.id)?.cardIds).toEqual([]);

    const player = readPlayer(maps, "p1");
    expect(player?.deckLoaded).toBe(false);
    expect(player?.libraryTopReveal).toBeUndefined();
    expect(player?.handCount).toBe(0);
    expect(player?.libraryCount).toBe(0);
    expect(player?.sideboardCount).toBe(0);
  });

  it("should mulligan by drawing up to the requested count", () => {
    const doc = createDoc();
    const maps = getMaps(doc);
    const hidden = createEmptyHiddenState();

    writePlayer(maps, makePlayer("p1"));

    const library = makeZone("lib-p1", ZONE.LIBRARY, "p1");
    const hand = makeZone("hand-p1", ZONE.HAND, "p1");
    writeZone(maps, library);
    writeZone(maps, hand);

    hidden.libraryOrder.p1 = ["c1", "c2", "c3"];
    hidden.cards.c1 = makeCard("c1", "p1", library.id);
    hidden.cards.c2 = makeCard("c2", "p1", library.id);
    hidden.cards.c3 = makeCard("c3", "p1", library.id);

    const drawn = applyMulligan(maps, hidden, "p1", 2);

    expect(drawn).toBe(2);
    expect(hidden.handOrder.p1).toHaveLength(2);
    expect(hidden.libraryOrder.p1).toHaveLength(1);

    const combined = [...hidden.handOrder.p1, ...hidden.libraryOrder.p1].sort();
    expect(combined).toEqual(["c1", "c2", "c3"].sort());

    expect(readZone(maps, hand.id)?.cardIds).toHaveLength(2);
    expect(readZone(maps, library.id)?.cardIds).toEqual([]);
  });
});
