import * as Y from "yjs";
import { describe, expect, it } from "vitest";

import type { Player, Zone } from "@/types";
import type { SharedMaps } from "@/yjs/yMutations";
import { sharedSnapshot, upsertPlayer, upsertZone } from "@/yjs/yMutations";
import { ZONE } from "@/constants/zones";

import {
  ensureLocalPlayerInitialized,
  getDefaultPlayerName,
  resolveDesiredPlayerName,
} from "../ensureLocalPlayerInitialized";

const createSharedMaps = (doc: Y.Doc): SharedMaps => ({
  players: doc.getMap("players"),
  playerOrder: doc.getArray("playerOrder"),
  zones: doc.getMap("zones"),
  cards: doc.getMap("cards"),
  zoneCardOrders: doc.getMap("zoneCardOrders"),
  globalCounters: doc.getMap("globalCounters"),
  battlefieldViewScale: doc.getMap("battlefieldViewScale"),
});

const createZonesForPlayer = (playerId: string): Zone[] => [
  { id: `${playerId}-${ZONE.LIBRARY}`, type: ZONE.LIBRARY, ownerId: playerId, cardIds: [] },
  { id: `${playerId}-${ZONE.HAND}`, type: ZONE.HAND, ownerId: playerId, cardIds: [] },
  { id: `${playerId}-${ZONE.BATTLEFIELD}`, type: ZONE.BATTLEFIELD, ownerId: playerId, cardIds: [] },
  { id: `${playerId}-${ZONE.GRAVEYARD}`, type: ZONE.GRAVEYARD, ownerId: playerId, cardIds: [] },
  { id: `${playerId}-${ZONE.EXILE}`, type: ZONE.EXILE, ownerId: playerId, cardIds: [] },
  { id: `${playerId}-${ZONE.COMMANDER}`, type: ZONE.COMMANDER, ownerId: playerId, cardIds: [] },
];

describe("ensureLocalPlayerInitialized", () => {
  it("creates the local player and missing default zones", () => {
    const doc = new Y.Doc();
    const maps = createSharedMaps(doc);

    ensureLocalPlayerInitialized({
      transact: (fn) => doc.transact(fn),
      sharedMaps: maps,
      playerId: "p1",
      preferredUsername: "Alice",
    });

    const snapshot = sharedSnapshot(maps);

    expect(snapshot.players.p1?.name).toBe("Alice");
    expect(snapshot.zones[`${"p1"}-${ZONE.LIBRARY}`]).toBeTruthy();
    expect(snapshot.zones[`${"p1"}-${ZONE.HAND}`]).toBeTruthy();
    expect(snapshot.zones[`${"p1"}-${ZONE.BATTLEFIELD}`]).toBeTruthy();
    expect(snapshot.zones[`${"p1"}-${ZONE.GRAVEYARD}`]).toBeTruthy();
    expect(snapshot.zones[`${"p1"}-${ZONE.EXILE}`]).toBeTruthy();
    expect(snapshot.zones[`${"p1"}-${ZONE.COMMANDER}`]).toBeTruthy();
  });

  it("patches the local player's name when it is still the default", () => {
    const doc = new Y.Doc();
    const maps = createSharedMaps(doc);
    const playerId = "p1";

    const existing: Player = {
      id: playerId,
      name: getDefaultPlayerName(playerId),
      life: 40,
      counters: [],
      commanderDamage: {},
      commanderTax: 0,
      deckLoaded: false,
      color: "rose",
    };

    upsertPlayer(maps, existing);
    createZonesForPlayer(playerId).forEach((zone) => upsertZone(maps, zone));

    ensureLocalPlayerInitialized({
      transact: (fn) => doc.transact(fn),
      sharedMaps: maps,
      playerId,
      preferredUsername: "Bob",
    });

    const snapshot = sharedSnapshot(maps);
    expect(snapshot.players.p1?.name).toBe("Bob");
  });
});

describe("resolveDesiredPlayerName", () => {
  it("falls back to the default name when username is blank", () => {
    expect(resolveDesiredPlayerName("   ", "Player P1")).toBe("Player P1");
  });
});

