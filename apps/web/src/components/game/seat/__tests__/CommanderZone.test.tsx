import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

import { useGameStore } from "@/store/gameStore";
import { ZONE } from "@/constants/zones";

import { CommanderZone } from "../CommanderZone";

describe("CommanderZone", () => {
  let originalUpdateCommanderTax: unknown;

  beforeEach(() => {
    originalUpdateCommanderTax = useGameStore.getState().updateCommanderTax;
  });

  afterEach(() => {
    act(() => {
      useGameStore.setState({ updateCommanderTax: originalUpdateCommanderTax as any } as any);
    });
  });

  it("updates commander tax for the zone owner", () => {
    const updateCommanderTax = vi.fn();
    act(() => {
      useGameStore.setState({
        myPlayerId: "me",
        players: { me: { id: "me", commanderTax: 0 } as any },
        updateCommanderTax: updateCommanderTax as any,
      } as any);
    });

    render(
      <CommanderZone
        zone={{ id: "cmd-me", type: ZONE.COMMANDER, ownerId: "me", cardIds: [] } as any}
        cards={[]}
        isTop={false}
        isRight={false}
        scale={1}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Increase commander tax" }));
    expect(updateCommanderTax).toHaveBeenCalledWith("me", 2);
  });
});
