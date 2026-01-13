import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { useGameStore } from "@/store/gameStore";
import { ensureLocalStorage } from "@/store/testUtils";

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

    render(<Sidenav />);

    fireEvent.click(screen.getByRole("button", { name: "Untap All" }));
    expect(untapAll).toHaveBeenCalledTimes(1);
    expect(untapAll).toHaveBeenCalledWith("me");
  });

  it("opens the share dialog from the share button", () => {
    const onOpenShareDialog = vi.fn();

    render(<Sidenav onOpenShareDialog={onOpenShareDialog} />);

    fireEvent.click(screen.getByRole("button", { name: "Share room" }));
    expect(onOpenShareDialog).toHaveBeenCalledTimes(1);
  });
});
