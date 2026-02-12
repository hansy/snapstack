import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DndContext } from "@dnd-kit/core";

import { useGameStore } from "@/store/gameStore";
import type { Player, Zone } from "@/types";

import { PortraitSeatToolbar } from "../PortraitSeatToolbar";

const makePlayer = (overrides: Partial<Player> = {}): Player =>
  ({
    id: "p1",
    name: "Player One",
    life: 40,
    deckLoaded: false,
    counters: [],
    commanderDamage: {},
    commanderTax: 0,
    ...overrides,
  }) as Player;

const makeZone = (id: string, type: Zone["type"], ownerId = "p1"): Zone =>
  ({
    id,
    ownerId,
    type,
    cardIds: [],
  }) as Zone;

describe("PortraitSeatToolbar", () => {
  let originalUpdatePlayer: unknown;
  let originalPlayers: unknown;

  beforeEach(() => {
    originalUpdatePlayer = useGameStore.getState().updatePlayer;
    originalPlayers = useGameStore.getState().players;
    useGameStore.setState({
      myPlayerId: "me",
      updatePlayer: vi.fn() as any,
      players: {
        me: makePlayer({ id: "me", name: "Me" }),
        p1: makePlayer({ id: "p1", name: "Opponent" }),
      },
    } as any);
  });

  afterEach(() => {
    useGameStore.setState({
      updatePlayer: originalUpdatePlayer as any,
      players: originalPlayers as any,
    } as any);
  });

  const baseProps = {
    player: makePlayer({ id: "p1", name: "Opponent" }),
    isMe: false,
    opponentColors: { me: "rose", p1: "sky" },
    library: makeZone("lib-p1", "library", "p1"),
    graveyard: makeZone("gy-p1", "graveyard", "p1"),
    exile: makeZone("ex-p1", "exile", "p1"),
    libraryCount: 0,
    graveyardCount: 0,
    exileCount: 0,
    opponentLibraryRevealCount: 0,
    onViewZone: vi.fn(),
    onDrawCard: vi.fn(),
    onOpponentLibraryReveals: vi.fn(),
    onZoneContextMenu: vi.fn(),
    onLoadDeck: vi.fn(),
  } as const;

  it("hides load-library CTA on opponent seats when deck is not loaded", () => {
    render(
      <DndContext>
        <PortraitSeatToolbar {...baseProps} showLoadLibraryAction={false} />
      </DndContext>,
    );

    expect(screen.queryByRole("button", { name: "Load Library" })).toBeNull();
    expect(screen.getByRole("button", { name: "Library" })).not.toBeNull();
  });

  it("shows the load-library CTA only when explicitly enabled", () => {
    const onLoadDeck = vi.fn();
    render(
      <DndContext>
        <PortraitSeatToolbar
          {...baseProps}
          isMe
          player={makePlayer({ id: "me", name: "Me", deckLoaded: false })}
          onLoadDeck={onLoadDeck}
          showLoadLibraryAction
        />
      </DndContext>,
    );

    const button = screen.getByRole("button", { name: "Load Library" });
    fireEvent.click(button);
    expect(onLoadDeck).toHaveBeenCalled();
  });

  it("hides life and commander-damage +/- controls for opponent life dialog", () => {
    render(
      <DndContext>
        <PortraitSeatToolbar
          {...baseProps}
          player={makePlayer({
            id: "p1",
            name: "Opponent",
            commanderDamage: { me: 3 },
          })}
          showLoadLibraryAction={false}
        />
      </DndContext>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open life details" }));

    expect(screen.queryByRole("button", { name: "Decrease life" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Increase life" })).toBeNull();
    expect(
      screen.queryByRole("button", {
        name: "Decrease commander damage from Me",
      }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", {
        name: "Increase commander damage from Me",
      }),
    ).toBeNull();
  });
});
