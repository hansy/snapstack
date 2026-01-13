import React from "react";
import { describe, expect, it, beforeEach, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

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

    expect(screen.getByText("Player link")).toBeTruthy();
    expect(screen.getByDisplayValue("https://example.com/room")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Copy" }));

    await waitFor(() => {
      expect(clipboardWriteText).toHaveBeenCalledWith("https://example.com/room");
    });
    expect(toast.success).toHaveBeenCalledWith(
      "Player link copied to clipboard"
    );
  });

  it("shows the spectator link when the room is locked", () => {
    renderDialog({ roomLockedByHost: true });

    expect(screen.getByText("Spectator link")).toBeTruthy();
    expect(
      screen.getByDisplayValue("https://example.com/room?role=spectator")
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Allow spectators?" })).toBeNull();
  });

  it("disables lock controls for non-hosts", () => {
    renderDialog({ isHost: false });

    expect(screen.getByRole("button", { name: "Lock room" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Allow spectators?" })
    ).toBeDisabled();
  });

  it("allows hosts to toggle the room lock", () => {
    const onToggleRoomLock = vi.fn();
    renderDialog({ onToggleRoomLock });

    fireEvent.click(screen.getByRole("button", { name: "Lock room" }));
    expect(onToggleRoomLock).toHaveBeenCalledTimes(1);
  });
});
