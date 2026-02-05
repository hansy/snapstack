import { describe, expect, it } from "vitest";
import type { Player, Zone } from "@/types";
import { ZONE } from "@/constants/zones";
import { computeLocalPlayerInitPlan } from "../localPlayerInitPlan";
import { computePlayerColors } from "@/lib/playerColors";

const makePlayer = (id: string, name: string, color?: string): Player => ({
  id,
  name,
  life: 40,
  counters: [],
  commanderDamage: {},
  commanderTax: 0,
  deckLoaded: false,
  color,
});

const makeZone = (id: string, type: Zone["type"], ownerId: string): Zone => ({
  id,
  type,
  ownerId,
  cardIds: [],
});

describe("computeLocalPlayerInitPlan", () => {
  it("plans player+zone creation for a new player", () => {
    const plan = computeLocalPlayerInitPlan({
      players: {},
      playerOrder: [],
      zones: {},
      playerId: "p1",
      desiredName: "Hans",
      defaultName: "Player P1",
    });

    expect(plan).toBeTruthy();
    expect(plan?.upsertPlayer?.id).toBe("p1");
    expect(plan?.upsertPlayer?.name).toBe("Hans");
    expect(plan?.zonesToCreate.map((z) => z.type).sort()).toEqual(
      [ZONE.LIBRARY, ZONE.HAND, ZONE.BATTLEFIELD, ZONE.GRAVEYARD, ZONE.EXILE, ZONE.COMMANDER].sort()
    );
  });

  it("returns null when everything is already initialized", () => {
    const playerId = "p1";
    const players: Record<string, Player> = {
      [playerId]: makePlayer(playerId, "Alice", "rose"),
    };
    const zones: Record<string, Zone> = {
      lib: makeZone(`${playerId}-${ZONE.LIBRARY}`, ZONE.LIBRARY, playerId),
      hand: makeZone(`${playerId}-${ZONE.HAND}`, ZONE.HAND, playerId),
      bf: makeZone(`${playerId}-${ZONE.BATTLEFIELD}`, ZONE.BATTLEFIELD, playerId),
      gy: makeZone(`${playerId}-${ZONE.GRAVEYARD}`, ZONE.GRAVEYARD, playerId),
      ex: makeZone(`${playerId}-${ZONE.EXILE}`, ZONE.EXILE, playerId),
      cmd: makeZone(`${playerId}-${ZONE.COMMANDER}`, ZONE.COMMANDER, playerId),
    };

    expect(
      computeLocalPlayerInitPlan({
        players,
        playerOrder: [playerId],
        zones,
        playerId,
        desiredName: "Hans",
        defaultName: "Player P1",
      })
    ).toBeNull();
  });

  it("plans a name patch when the current name is the default", () => {
    const playerId = "p1";
    const defaultName = `Player ${playerId.slice(0, 4).toUpperCase()}`;
    const players: Record<string, Player> = {
      [playerId]: makePlayer(playerId, defaultName, "rose"),
    };

    const plan = computeLocalPlayerInitPlan({
      players,
      playerOrder: [playerId],
      zones: {},
      playerId,
      desiredName: "Hans",
      defaultName,
    });

    expect(plan?.patchLocalPlayer).toEqual({ name: "Hans" });
  });

  it("plans color patches for players missing a color", () => {
    const players: Record<string, Player> = {
      p1: makePlayer("p1", "P1"),
      p2: makePlayer("p2", "P2", "violet"),
    };
    const expected = computePlayerColors(["p1", "p2"]);

    const plan = computeLocalPlayerInitPlan({
      players,
      playerOrder: ["p1", "p2"],
      zones: {},
      playerId: "p1",
      desiredName: "P1",
      defaultName: "Player P1",
    });

    expect(plan?.patchLocalPlayer).toEqual({ color: expected.p1 });
    expect(plan?.patchColors).toEqual([]);
  });

  it("patches the local player color when it differs from the canonical order", () => {
    const players: Record<string, Player> = {
      p1: makePlayer("p1", "P1", "rose"),
      p2: makePlayer("p2", "P2", "rose"),
    };
    const expected = computePlayerColors(["p1", "p2"]);

    const plan = computeLocalPlayerInitPlan({
      players,
      playerOrder: ["p1", "p2"],
      zones: {},
      playerId: "p2",
      desiredName: "P2",
      defaultName: "Player P2",
    });

    expect(plan?.patchLocalPlayer).toEqual({ color: expected.p2 });
    expect(plan?.patchColors).toEqual([]);
  });
});
