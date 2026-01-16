import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import type { Card } from "../../../web/src/types/cards";
import type { Zone } from "../../../web/src/types/zones";
import { ZONE } from "../constants";
import { createEmptyHiddenState } from "../hiddenState";
import { applyCardMove } from "../movement";
import { getMaps, readZone, writeCard, writeZone } from "../yjsStore";

const createDoc = () => new Y.Doc();

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

const makeCard = (id: string, ownerId: string, zoneId: string, overrides: Partial<Card> = {}): Card => ({
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

describe("applyCardMove", () => {
  it("should remove tokens that leave the battlefield", () => {
    const doc = createDoc();
    const maps = getMaps(doc);
    const hidden = createEmptyHiddenState();

    const battlefield = makeZone("bf", ZONE.BATTLEFIELD, "p1", ["t1"]);
    const graveyard = makeZone("gy", ZONE.GRAVEYARD, "p1");
    writeZone(maps, battlefield);
    writeZone(maps, graveyard);

    writeCard(maps, makeCard("t1", "p1", battlefield.id, { isToken: true }));

    const logEvents: { eventId: string; payload: Record<string, unknown> }[] = [];
    let hiddenChanged = false;

    const result = applyCardMove(
      maps,
      hidden,
      { actorId: "p1", cardId: "t1", toZoneId: graveyard.id },
      "top",
      (eventId, payload) => logEvents.push({ eventId, payload }),
      () => {
        hiddenChanged = true;
      }
    );

    expect(result.ok).toBe(true);
    expect(maps.cards.get("t1")).toBeUndefined();
    expect(readZone(maps, battlefield.id)?.cardIds).toEqual([]);
    expect(readZone(maps, graveyard.id)?.cardIds).toEqual([]);
    expect(hiddenChanged).toBe(false);
    expect(logEvents[0]?.eventId).toBe("card.move");
  });

  it("should log draws when moving a hidden library card to hand with suppressLog", () => {
    const doc = createDoc();
    const maps = getMaps(doc);
    const hidden = createEmptyHiddenState();

    const library = makeZone("lib", ZONE.LIBRARY, "p1");
    const hand = makeZone("hand", ZONE.HAND, "p1");
    writeZone(maps, library);
    writeZone(maps, hand);

    hidden.libraryOrder.p1 = ["c1"];
    hidden.cards.c1 = makeCard("c1", "p1", library.id);

    const logEvents: { eventId: string; payload: Record<string, unknown> }[] = [];
    let hiddenChanged = false;

    const result = applyCardMove(
      maps,
      hidden,
      {
        actorId: "p1",
        cardId: "c1",
        toZoneId: hand.id,
        opts: { suppressLog: true },
      },
      "top",
      (eventId, payload) => logEvents.push({ eventId, payload }),
      () => {
        hiddenChanged = true;
      }
    );

    expect(result.ok).toBe(true);
    expect(logEvents).toEqual([
      {
        eventId: "card.draw",
        payload: { actorId: "p1", playerId: "p1", count: 1 },
      },
    ]);
    expect(hidden.libraryOrder.p1).toEqual([]);
    expect(hidden.handOrder.p1).toEqual(["c1"]);
    expect(hidden.cards.c1.zoneId).toBe(hand.id);
    expect(readZone(maps, hand.id)?.cardIds).toEqual(["c1"]);
    expect(hiddenChanged).toBe(true);
  });
});
