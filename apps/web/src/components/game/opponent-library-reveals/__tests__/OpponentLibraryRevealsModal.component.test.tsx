import { act, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DndContext } from "@dnd-kit/core";

import { useGameStore } from "@/store/gameStore";
import { ZONE } from "@/constants/zones";
import { CardPreviewProvider } from "@/components/game/card/CardPreviewProvider";

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
          "lib-p1": { id: "lib-p1", type: ZONE.LIBRARY, ownerId: "p1", cardIds: [] } as any,
        },
        cards: {},
        libraryRevealsToAll: {
          c1: { card: { name: "Revealed Card" }, orderKey: "000001", ownerId: "p1" },
        },
      } as any);
    });

    const onClose = vi.fn();

    render(
      <DndContext>
        <CardPreviewProvider>
          <OpponentLibraryRevealsModal isOpen onClose={onClose} zoneId="lib-p1" />
        </CardPreviewProvider>
      </DndContext>
    );

    expect(await screen.findByText("Revealed cards in Opponent's library")).toBeTruthy();
    expect(screen.getByText("Revealed Card")).toBeTruthy();

    act(() => {
      useGameStore.setState((state: any) => ({
        ...state,
        libraryRevealsToAll: {},
      }));
    });

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
