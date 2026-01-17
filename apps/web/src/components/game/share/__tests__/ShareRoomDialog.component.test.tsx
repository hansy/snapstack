import React from "react";
import { describe, expect, it, beforeEach, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import { ShareRoomDialog } from "../ShareRoomDialog";
import { toast } from "sonner";
import type { Player } from "@/types";

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const buildPlayer = (id: string, name = id): Player => ({
  id,
  name,
  life: 40,
  counters: [],
  commanderDamage: {},
  commanderTax: 0,
});

type ShareRoomDialogProps = React.ComponentProps<typeof ShareRoomDialog>;

const renderDialog = (overrides: Partial<ShareRoomDialogProps> = {}) => {
  const props: ShareRoomDialogProps = {
    open: true,
    onClose: vi.fn(),
    playerLink: "https://example.com/room",
    spectatorLink: "https://example.com/room?role=spectator",
    players: {
      p1: buildPlayer("p1", "Alice"),
      p2: buildPlayer("p2", "Bob"),
    },
    isHost: true,
    roomLockedByHost: false,
    roomIsFull: false,
    onToggleRoomLock: vi.fn(),
    ...overrides,
  };

  return render(<ShareRoomDialog {...props} />);
};

describe("ShareRoomDialog", () => {
  let clipboardWriteText: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.error).mockClear();
    clipboardWriteText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: clipboardWriteText },
      writable: true,
    });
  });

  it("copies the active player link when the room is unlocked", async () => {
    renderDialog();

    const playerLabel = screen.getByText("Player invite link");
    const playerInput = screen.getByDisplayValue("https://example.com/room");
    expect(playerLabel).toBeTruthy();
    expect(playerInput).toBeTruthy();

    const playerField = playerLabel.closest("div")?.parentElement;
    const copyButton = playerField
      ? within(playerField).getByRole("button", { name: "Copy" })
      : screen.getAllByRole("button", { name: "Copy" })[0];
    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(clipboardWriteText).toHaveBeenCalledWith(
        "https://example.com/room"
      );
    });
    expect(toast.success).toHaveBeenCalledWith(
      "Player invite link copied to clipboard"
    );
  });

  it("shows the spectator link when the room is locked", () => {
    renderDialog({ roomLockedByHost: true });

    expect(screen.getByText("Spectator invite link")).toBeTruthy();
    expect(
      screen.getByDisplayValue("https://example.com/room?role=spectator")
    ).toBeTruthy();
  });

  it("shows a loading state before links are ready", () => {
    renderDialog({ linksReady: false });

    expect(screen.getByText("Generating invite links...")).toBeTruthy();
    expect(screen.queryByText("Player invite link")).toBeNull();
    expect(screen.queryByText("Spectator invite link")).toBeNull();
    expect(screen.queryByDisplayValue("https://example.com/room")).toBeNull();
  });

  it("disables lock controls for non-hosts", () => {
    renderDialog({ isHost: false });

    const lockButton = screen.getByRole("button", {
      name: "Lock room",
    }) as HTMLButtonElement;

    expect(lockButton.disabled).toBe(true);
  });

  it("allows hosts to toggle the room lock", () => {
    const onToggleRoomLock = vi.fn();
    renderDialog({ onToggleRoomLock });

    fireEvent.click(screen.getByRole("button", { name: "Lock room" }));
    expect(onToggleRoomLock).toHaveBeenCalledTimes(1);
  });

  it("ignores transient undefined players when sorting", () => {
    renderDialog({
      players: {
        p1: buildPlayer("p1", "Alice"),
        p2: undefined as any,
      } as any,
    });

    expect(screen.getByText("Players (1/4)")).toBeTruthy();
    expect(screen.getByText("Alice")).toBeTruthy();
  });
});
