import * as Y from "yjs";
import { describe, expect, it, vi } from "vitest";

import type { Player } from "@/types";
import type { SharedMaps } from "@/yjs/yMutations";
import { upsertPlayer } from "@/yjs/yMutations";

import { createFullSyncToStore } from "../fullSyncToStore";

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
  };
};

describe("createFullSyncToStore", () => {
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
    const next = setState.mock.calls[0][0] as any;
    expect(next.players.p1?.name).toBe("P1");
    expect(next.playerOrder).toEqual(["p1"]);
  });
});
