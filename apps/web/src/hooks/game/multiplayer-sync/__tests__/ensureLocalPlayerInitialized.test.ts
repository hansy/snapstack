import { describe, expect, it, vi } from "vitest";

import type { GameState, Player, Zone } from "@/types";
import { ZONE } from "@/constants/zones";
import { MAX_PLAYERS } from "@/lib/room";

import {
  ensureLocalPlayerInitialized,
  getDefaultPlayerName,
  resolveDesiredPlayerName,
} from "../ensureLocalPlayerInitialized";

const createZonesForPlayer = (playerId: string): Zone[] => [
  { id: `${playerId}-${ZONE.LIBRARY}`, type: ZONE.LIBRARY, ownerId: playerId, cardIds: [] },
  { id: `${playerId}-${ZONE.HAND}`, type: ZONE.HAND, ownerId: playerId, cardIds: [] },
  { id: `${playerId}-${ZONE.BATTLEFIELD}`, type: ZONE.BATTLEFIELD, ownerId: playerId, cardIds: [] },
  { id: `${playerId}-${ZONE.GRAVEYARD}`, type: ZONE.GRAVEYARD, ownerId: playerId, cardIds: [] },
  { id: `${playerId}-${ZONE.EXILE}`, type: ZONE.EXILE, ownerId: playerId, cardIds: [] },
  { id: `${playerId}-${ZONE.COMMANDER}`, type: ZONE.COMMANDER, ownerId: playerId, cardIds: [] },
];

const baseState = (): Pick<
  GameState,
  "players" | "playerOrder" | "zones" | "roomLockedByHost" | "roomOverCapacity"
> => ({
  players: {},
  playerOrder: [],
  zones: {},
  roomLockedByHost: false,
  roomOverCapacity: false,
});

describe("ensureLocalPlayerInitialized", () => {
  it("creates the local player and missing default zones", () => {
    const addPlayer = vi.fn();
    const updatePlayer = vi.fn();
    const addZone = vi.fn();

    const state = baseState();

    ensureLocalPlayerInitialized({
      state,
      actions: { addPlayer, updatePlayer, addZone },
      playerId: "p1",
      preferredUsername: "Alice",
    });

    expect(addPlayer).toHaveBeenCalledTimes(1);
    expect(addPlayer).toHaveBeenCalledWith(expect.objectContaining({ id: "p1", name: "Alice" }));
    expect(addZone).toHaveBeenCalledTimes(6);
  });

  it("patches the local player's name when it is still the default", () => {
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

    const state = baseState();
    state.players[playerId] = existing;
    state.zones = Object.fromEntries(createZonesForPlayer(playerId).map((zone) => [zone.id, zone]));

    const addPlayer = vi.fn();
    const updatePlayer = vi.fn();
    const addZone = vi.fn();

    ensureLocalPlayerInitialized({
      state,
      actions: { addPlayer, updatePlayer, addZone },
      playerId,
      preferredUsername: "Bob",
    });

    expect(updatePlayer).toHaveBeenCalledWith(playerId, { name: "Bob" }, playerId);
    expect(addPlayer).not.toHaveBeenCalled();
    expect(addZone).not.toHaveBeenCalled();
  });

  it("blocks new players when the room is locked or full", () => {
    const lockedState = baseState();
    lockedState.roomLockedByHost = true;

    const addPlayer = vi.fn();
    const updatePlayer = vi.fn();
    const addZone = vi.fn();

    const result = ensureLocalPlayerInitialized({
      state: lockedState,
      actions: { addPlayer, updatePlayer, addZone },
      playerId: "p1",
      preferredUsername: "Alice",
    });

    expect(result?.status).toBe("blocked");
    expect(addPlayer).not.toHaveBeenCalled();

    const fullState = baseState();
    for (let i = 0; i < MAX_PLAYERS; i += 1) {
      fullState.players[`p${i}`] = {
        id: `p${i}`,
        name: `P${i}`,
        life: 40,
        counters: [],
        commanderDamage: {},
        commanderTax: 0,
        deckLoaded: false,
        color: "rose",
      };
      fullState.playerOrder.push(`p${i}`);
    }

    const fullResult = ensureLocalPlayerInitialized({
      state: fullState,
      actions: { addPlayer, updatePlayer, addZone },
      playerId: "p9",
      preferredUsername: "Late",
    });

    expect(fullResult?.status).toBe("blocked");
    expect(addPlayer).not.toHaveBeenCalled();
  });
});

describe("resolveDesiredPlayerName", () => {
  it("falls back to the default name when username is blank", () => {
    expect(resolveDesiredPlayerName("   ", "Player P1")).toBe("Player P1");
  });
});
