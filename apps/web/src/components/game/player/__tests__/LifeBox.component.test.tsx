import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

import { useGameStore } from "@/store/gameStore";
import { MAX_PLAYER_LIFE, MIN_PLAYER_LIFE } from "@/lib/limits";

import { LifeBox } from "../LifeBox";

describe("LifeBox", () => {
  let originalUpdatePlayer: unknown;

  beforeEach(() => {
    originalUpdatePlayer = useGameStore.getState().updatePlayer;
  });

  afterEach(() => {
    act(() => {
      useGameStore.setState({ updatePlayer: originalUpdatePlayer as any } as any);
    });
  });

  it("updates player life when incrementing", () => {
    const updatePlayer = vi.fn();
    act(() => {
      useGameStore.setState({ updatePlayer } as any);
    });

    render(
      <LifeBox
        player={{
          id: "me",
          name: "Me",
          life: 40,
          counters: [],
          commanderDamage: {},
          commanderTax: 0,
        } as any}
        isMe
        opponentColors={{ me: "rose" }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Increase life" }));
    expect(updatePlayer).toHaveBeenCalledTimes(1);
    expect(updatePlayer).toHaveBeenCalledWith("me", { life: 41 });
  });

  it("invokes context menu handler when right clicking life total", () => {
    const onContextMenu = vi.fn();

    render(
      <LifeBox
        player={{
          id: "me",
          name: "Me",
          life: 25,
          counters: [],
          commanderDamage: {},
          commanderTax: 0,
        } as any}
        isMe
        opponentColors={{ me: "rose" }}
        onContextMenu={onContextMenu}
      />
    );

    fireEvent.contextMenu(screen.getByText("25"));
    expect(onContextMenu).toHaveBeenCalledTimes(1);
  });

  it("disables decrement at minimum life", () => {
    render(
      <LifeBox
        player={{
          id: "me",
          name: "Me",
          life: MIN_PLAYER_LIFE,
          counters: [],
          commanderDamage: {},
          commanderTax: 0,
        } as any}
        isMe
        opponentColors={{ me: "rose" }}
      />
    );

    const button = screen.getByRole("button", { name: "Decrease life" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it("disables increment at maximum life", () => {
    render(
      <LifeBox
        player={{
          id: "me",
          name: "Me",
          life: MAX_PLAYER_LIFE,
          counters: [],
          commanderDamage: {},
          commanderTax: 0,
        } as any}
        isMe
        opponentColors={{ me: "rose" }}
      />
    );

    const button = screen.getByRole("button", { name: "Increase life" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });
});
