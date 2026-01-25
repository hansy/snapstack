import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { useGameStore } from "@/store/gameStore";
import { ensureLocalStorage } from '@test/utils/storage';

import { Sidenav } from "../Sidenav";

describe("Sidenav", () => {
  beforeAll(() => {
    ensureLocalStorage();
  });

  beforeEach(() => {
    localStorage.clear();
  });

  it("calls untapAll with myPlayerId", () => {
    const untapAll = vi.fn();

    useGameStore.setState({
      myPlayerId: "me",
      untapAll: untapAll as unknown as (playerId: string) => void,
    });

    render(<Sidenav onOpenCoinFlipper={vi.fn()} onOpenDiceRoller={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Untap All" }));
    expect(untapAll).toHaveBeenCalledTimes(1);
    expect(untapAll).toHaveBeenCalledWith("me");
  });

  it("opens the share dialog from the share button", () => {
    const onOpenShareDialog = vi.fn();

    render(
      <Sidenav
        onOpenCoinFlipper={vi.fn()}
        onOpenDiceRoller={vi.fn()}
        onOpenShareDialog={onOpenShareDialog}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Share room" }));
    expect(onOpenShareDialog).toHaveBeenCalledTimes(1);
  });

  it("disables the share button before invite links are ready", () => {
    const onOpenShareDialog = vi.fn();

    render(
      <Sidenav
        onOpenCoinFlipper={vi.fn()}
        onOpenDiceRoller={vi.fn()}
        onOpenShareDialog={onOpenShareDialog}
        shareLinksReady={false}
      />
    );

    const shareButton = screen.getByRole("button", { name: "Share room" });
    expect((shareButton as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(shareButton);
    expect(onOpenShareDialog).not.toHaveBeenCalled();
  });
});
