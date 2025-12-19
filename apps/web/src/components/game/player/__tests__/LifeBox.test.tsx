import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

import { useGameStore } from "@/store/gameStore";

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
});
