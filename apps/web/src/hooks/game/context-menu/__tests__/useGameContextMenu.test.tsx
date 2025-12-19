import React from "react";
import { render, waitFor } from "@testing-library/react";
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Card, Player, Zone } from "@/types";
import { ZONE } from "@/constants/zones";
import { useGameStore } from "@/store/gameStore";
import { useGameContextMenu } from "../useGameContextMenu";

type HookValue = ReturnType<typeof useGameContextMenu>;

const resetStore = (overrides?: Partial<ReturnType<typeof useGameStore.getState>>) => {
  act(() => {
    useGameStore.setState((state: any) => ({
      ...state,
      players: {},
      zones: {},
      cards: {},
      globalCounters: {},
      ...overrides,
    }));
  });
};

const createPlayer = (id: string, deckLoaded: boolean): Player => ({
  id,
  name: id,
  life: 40,
  counters: [],
  commanderDamage: {},
  commanderTax: 0,
  deckLoaded,
});

const createZone = (id: string, ownerId: string, type: Zone["type"], cardIds: string[] = []): Zone => ({
  id,
  ownerId,
  type,
  cardIds,
});

const createCard = (id: string, zoneId: string, controllerId: string): Card => ({
  id,
  ownerId: controllerId,
  controllerId,
  zoneId,
  name: "Test Card",
  tapped: false,
  faceDown: false,
  position: { x: 0.1, y: 0.1 },
  rotation: 0,
  counters: [],
});

const createEvent = () =>
  ({
    preventDefault: vi.fn(),
    clientX: 10,
    clientY: 20,
  }) as any;

const Probe: React.FC<{ myPlayerId: string; onValue: (value: HookValue) => void }> = ({
  myPlayerId,
  onValue,
}) => {
  const value = useGameContextMenu(myPlayerId);
  React.useEffect(() => {
    onValue(value);
  }, [value, onValue]);
  return null;
};

describe("useGameContextMenu", () => {
  beforeEach(() => {
    resetStore();
  });

  it("opens battlefield context menu only when deck is loaded", async () => {
    resetStore({ players: { me: createPlayer("me", true) } as any });

    let value: HookValue | null = null;
    render(<Probe myPlayerId="me" onValue={(v) => { value = v; }} />);

    await waitFor(() => expect(value).not.toBeNull());

    act(() => {
      value!.handleBattlefieldContextMenu(createEvent(), vi.fn());
    });

    await waitFor(() => {
      expect(value!.contextMenu).toBeTruthy();
      expect(value!.contextMenu?.items?.[0]).toMatchObject({
        type: "action",
        label: "Create Token",
      });
    });

    act(() => {
      value!.closeContextMenu();
    });

    await waitFor(() => {
      expect(value!.contextMenu).toBeNull();
    });

    // Deck not loaded -> no menu
    resetStore({ players: { me: createPlayer("me", false) } as any });
    act(() => {
      value!.handleBattlefieldContextMenu(createEvent(), vi.fn());
    });
    await waitFor(() => {
      expect(value!.contextMenu).toBeNull();
    });
  });

  it("opens card context menu for battlefield cards when deck is loaded", async () => {
    const battlefield = createZone("me-battlefield", "me", ZONE.BATTLEFIELD, ["c1"]);
    const card = createCard("c1", battlefield.id, "me");
    resetStore({
      players: { me: createPlayer("me", true) } as any,
      zones: { [battlefield.id]: battlefield } as any,
      cards: { [card.id]: card } as any,
    });

    let value: HookValue | null = null;
    render(<Probe myPlayerId="me" onValue={(v) => { value = v; }} />);

    await waitFor(() => expect(value).not.toBeNull());

    await act(async () => {
      await value!.handleCardContextMenu(createEvent(), card);
    });

    await waitFor(() => {
      expect(value!.contextMenu?.title).toBe("Test Card");
      const labels = (value!.contextMenu?.items ?? [])
        .filter((item: any) => item.type === "action")
        .map((item: any) => item.label);
      expect(labels).toContain("Tap/Untap");
    });
  });
});
