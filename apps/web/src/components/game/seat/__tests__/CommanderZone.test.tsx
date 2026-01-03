import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { DndContext } from "@dnd-kit/core";

import { useGameStore } from "@/store/gameStore";
import { useDragStore } from "@/store/dragStore";
import { useSelectionStore } from "@/store/selectionStore";
import { ZONE } from "@/constants/zones";
import { CardPreviewProvider } from "@/components/game/card/CardPreviewProvider";
import type { Card } from "@/types";

import { CommanderZone } from "../CommanderZone";

describe("CommanderZone", () => {
  let originalUpdateCard: unknown;

  beforeEach(() => {
    originalUpdateCard = useGameStore.getState().updateCard;
    useDragStore.setState({
      ghostCards: null,
      activeCardId: null,
      isGroupDragging: false,
      overCardScale: 1,
    });
    useSelectionStore.setState({ selectedCardIds: [], selectionZoneId: null });
  });

  afterEach(() => {
    act(() => {
      useGameStore.setState({ updateCard: originalUpdateCard as any } as any);
    });
  });

  it("updates commander tax for the zone owner", () => {
    const updateCard = vi.fn();
    const card: Card = {
      id: "c1",
      name: "Test Commander",
      ownerId: "me",
      controllerId: "me",
      zoneId: "cmd-me",
      tapped: false,
      faceDown: false,
      position: { x: 0.5, y: 0.5 },
      rotation: 0,
      counters: [],
      commanderTax: 0,
      isCommander: true,
    };
    const zone = {
      id: "cmd-me",
      type: ZONE.COMMANDER,
      ownerId: "me",
      cardIds: [card.id],
    } as any;
    act(() => {
      useGameStore.setState({
        myPlayerId: "me",
        viewerRole: "player",
        players: { me: { id: "me", commanderTax: 0 } as any },
        zones: { [zone.id]: zone },
        cards: { [card.id]: card },
        updateCard: updateCard as any,
      } as any);
    });

    render(
      <DndContext>
        <CardPreviewProvider>
          <CommanderZone
            zone={zone}
            cards={[card]}
            isTop={false}
            isRight={false}
            scale={1}
          />
        </CardPreviewProvider>
      </DndContext>
    );

    fireEvent.click(
      screen.getByRole("button", { name: `Increase commander tax for ${card.name}` })
    );
    expect(updateCard).toHaveBeenCalledWith(card.id, { commanderTax: 2 }, "me");
  });
});
