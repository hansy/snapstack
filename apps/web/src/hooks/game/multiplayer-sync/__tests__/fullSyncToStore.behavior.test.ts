import * as Y from "yjs";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Player } from "@/types";
import type { SharedMaps } from "@/yjs/legacyMutations";
import { upsertPlayer, upsertZone } from "@/yjs/legacyMutations";

import { createFullSyncToStore } from "../fullSyncToStore";
import { resetIntentState } from "@/store/gameStore/dispatchIntent";

const createSharedMaps = (): SharedMaps => {
  const doc = new Y.Doc();
  return {
    players: doc.getMap("players"),
    playerOrder: doc.getArray("playerOrder"),
    zones: doc.getMap("zones"),
    cards: doc.getMap("cards"),
    zoneCardOrders: doc.getMap("zoneCardOrders"),
    globalCounters: doc.getMap("globalCounters"),
    battlefieldViewScale: doc.getMap("battlefieldViewScale"),
    meta: doc.getMap("meta"),
    handRevealsToAll: doc.getMap("handRevealsToAll"),
    libraryRevealsToAll: doc.getMap("libraryRevealsToAll"),
    faceDownRevealsToAll: doc.getMap("faceDownRevealsToAll"),
  };
};

describe("createFullSyncToStore", () => {
  beforeEach(() => {
    resetIntentState();
  });

  it("hydrates a sanitized snapshot into the provided setState", () => {
    const maps = createSharedMaps();

    const player: Player = {
      id: "p1",
      name: "P1",
      life: 40,
      counters: [],
      commanderDamage: {},
      commanderTax: 0,
      deckLoaded: false,
    };

    upsertPlayer(maps, player);

    const setState = vi.fn();
    const fullSync = createFullSyncToStore(maps, setState as any);
    fullSync();

    expect(setState).toHaveBeenCalledTimes(1);
    const updater = setState.mock.calls[0][0] as any;
    const baseState = {
      players: {},
      zones: {},
      cards: {},
      playerOrder: [],
      globalCounters: {},
      battlefieldViewScale: {},
      roomHostId: null,
      roomLockedByHost: false,
      roomOverCapacity: false,
    } as any;
    const next = typeof updater === "function" ? updater(baseState) : updater;
    expect(next.players.p1?.name).toBe("P1");
    expect(next.playerOrder).toEqual(["p1"]);
  });

  it("merges existing private overlay during reconnect sync", () => {
    const maps = createSharedMaps();

    const player: Player = {
      id: "p1",
      name: "P1",
      life: 40,
      counters: [],
      commanderDamage: {},
      commanderTax: 0,
      deckLoaded: false,
    };

    upsertPlayer(maps, player);
    upsertZone(maps, { id: "hand", ownerId: "p1", type: "hand", cardIds: ["c1"] });

    const overlay = {
      schemaVersion: 1,
      overlayVersion: 1,
      roomId: "room",
      cards: [
        {
          id: "c1",
          name: "Secret",
          ownerId: "p1",
          controllerId: "p1",
          zoneId: "hand",
          tapped: false,
          faceDown: false,
          position: { x: 0.5, y: 0.5 },
          rotation: 0,
          counters: [],
        },
      ],
    };

    const setState = vi.fn();
    const fullSync = createFullSyncToStore(maps, setState as any);
    fullSync();

    const updater = setState.mock.calls[0][0] as any;
    const baseState = {
      players: {},
      zones: {},
      cards: {},
      playerOrder: [],
      globalCounters: {},
      battlefieldViewScale: {},
      roomHostId: null,
      roomLockedByHost: false,
      roomOverCapacity: false,
      privateOverlay: overlay,
    } as any;

    const next = typeof updater === "function" ? updater(baseState) : updater;
    expect(next.cards.c1?.name).toBe("Secret");
    expect(next.zones.hand?.cardIds).toEqual(["c1"]);
  });
});
