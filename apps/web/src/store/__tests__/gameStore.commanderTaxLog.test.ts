import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { ZONE } from "@/constants/zones";
import { useLogStore } from "@/logging/logStore";
import { useGameStore } from "../gameStore";
import { ensureLocalStorage } from "../testUtils";

describe("gameStore commander tax logging", () => {
  beforeAll(() => {
    ensureLocalStorage();
  });

  beforeEach(() => {
    localStorage.clear();
    useLogStore.getState().clear();
    useGameStore.setState({
      players: {},
      playerOrder: [],
      cards: {},
      zones: {},
      battlefieldViewScale: {},
      globalCounters: {},
      activeModal: null,
      sessionId: "s0",
      myPlayerId: "me",
      viewerRole: "player",
      playerIdsBySession: {},
      sessionVersions: {},
      hasHydrated: false,
    });
  });

  const seedCommander = (commanderTax = 0) => {
    const commanderZone = {
      id: "cz-me",
      type: ZONE.COMMANDER,
      ownerId: "me",
      cardIds: ["c1"],
    };

    useGameStore.setState((state) => ({
      ...state,
      zones: { ...state.zones, [commanderZone.id]: commanderZone },
      players: {
        ...state.players,
        me: {
          id: "me",
          name: "Me",
          life: 40,
          counters: [],
          commanderDamage: {},
          commanderTax: 0,
        },
      },
      cards: {
        ...state.cards,
        c1: {
          id: "c1",
          name: "Commander",
          ownerId: "me",
          controllerId: "me",
          zoneId: commanderZone.id,
          tapped: false,
          faceDown: false,
          position: { x: 0, y: 0 },
          rotation: 0,
          counters: [],
          isCommander: true,
          commanderTax,
        },
      },
    }));
  };

  it("logs commander tax changes when updating a commander card", () => {
    seedCommander(0);

    useGameStore.getState().updateCard("c1", { commanderTax: 2 }, "me");

    const entries = useLogStore.getState().entries;
    expect(entries).toHaveLength(1);
    expect(entries[0]?.eventId).toBe("player.commanderTax");
    expect(entries[0]?.payload).toMatchObject({
      playerId: "me",
      cardId: "c1",
      zoneId: "cz-me",
      cardName: "Commander",
      from: 0,
      to: 2,
      delta: 2,
    });
  });

  it("does not log when commander tax is unchanged", () => {
    seedCommander(0);

    useGameStore.getState().updateCard("c1", { commanderTax: 0 }, "me");

    expect(useLogStore.getState().entries).toHaveLength(0);
  });
});
