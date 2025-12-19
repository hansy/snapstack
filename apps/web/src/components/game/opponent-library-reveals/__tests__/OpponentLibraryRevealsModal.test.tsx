import { act, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useGameStore } from "@/store/gameStore";
import { ZONE } from "@/constants/zones";

import { OpponentLibraryRevealsModal } from "../OpponentLibraryRevealsModal";

describe("OpponentLibraryRevealsModal", () => {
  it("auto-closes when no cards remain revealed", async () => {
    act(() => {
      useGameStore.setState({
        myPlayerId: "me",
        players: {
          me: { id: "me", name: "Me", life: 40, counters: [], commanderDamage: {}, commanderTax: 0 } as any,
          p1: { id: "p1", name: "Opponent", life: 40, counters: [], commanderDamage: {}, commanderTax: 0 } as any,
        },
        zones: {
          "lib-p1": { id: "lib-p1", type: ZONE.LIBRARY, ownerId: "p1", cardIds: ["c1"] } as any,
        },
        cards: {
          c1: {
            id: "c1",
            name: "Revealed Card",
            ownerId: "p1",
            controllerId: "p1",
            zoneId: "lib-p1",
            tapped: false,
            faceDown: false,
            position: { x: 0, y: 0 },
            rotation: 0,
            counters: [],
            revealedTo: ["me"],
          } as any,
        },
      } as any);
    });

    const onClose = vi.fn();

    render(<OpponentLibraryRevealsModal isOpen onClose={onClose} zoneId="lib-p1" />);

    expect(await screen.findByText("Revealed cards in Opponent's library")).toBeTruthy();
    expect(screen.getByText("Revealed Card")).toBeTruthy();

    act(() => {
      useGameStore.setState((state: any) => ({
        ...state,
        cards: {
          ...state.cards,
          c1: { ...state.cards.c1, revealedTo: [] },
        },
      }));
    });

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});

