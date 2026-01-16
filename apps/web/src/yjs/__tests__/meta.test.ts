import * as Y from "yjs";
import { describe, expect, it } from "vitest";

import type { SharedMaps } from "../legacyMutations";
import { patchRoomMeta } from "../legacyMutations";

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

describe("patchRoomMeta", () => {
  it("sets host and lock fields", () => {
    const maps = createSharedMaps();

    patchRoomMeta(maps, { hostId: "p1", locked: true });

    expect(maps.meta.get("hostId")).toBe("p1");
    expect(maps.meta.get("locked")).toBe(true);
  });

  it("clears host when null is provided", () => {
    const maps = createSharedMaps();

    patchRoomMeta(maps, { hostId: "p1" });
    patchRoomMeta(maps, { hostId: null });

    expect(maps.meta.get("hostId")).toBeUndefined();
  });
});
