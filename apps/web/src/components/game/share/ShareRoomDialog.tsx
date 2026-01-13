import React from "react";
import { Copy, Lock, Unlock } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { MAX_PLAYERS } from "@/lib/room";
import type { Player, PlayerId } from "@/types";

type ShareRoomDialogProps = {
  open: boolean;
  onClose: () => void;
  playerLink: string;
  spectatorLink: string;
  players: Record<PlayerId, Player>;
  isHost: boolean;
  roomLockedByHost: boolean;
  roomIsFull: boolean;
  onToggleRoomLock: () => void;
};

type ShareLinkFieldProps = {
  label: string;
  value: string;
  onCopy: (label: string, value: string) => void;
};

const ShareLinkField: React.FC<ShareLinkFieldProps> = ({
  label,
  value,
  onCopy,
}) => {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          {label}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Input
          value={value}
          readOnly
          onFocus={(e) => e.currentTarget.select()}
          className="bg-zinc-950 border-zinc-800 text-zinc-100"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!value}
          onClick={() => onCopy(label, value)}
          className="border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
        >
          <Copy size={16} />
          Copy
        </Button>
      </div>
    </div>
  );
};

const formatPlayerName = (player: Player, index: number) => {
  const trimmed = player.name?.trim();
  if (trimmed) return trimmed;
  return `Player ${index + 1}`;
};

export const ShareRoomDialog: React.FC<ShareRoomDialogProps> = ({
  open,
  onClose,
  playerLink,
  spectatorLink,
  players,
  isHost,
  roomLockedByHost,
  roomIsFull,
  onToggleRoomLock,
}) => {
  const sortedPlayers = React.useMemo(() => {
    return Object.values(players).sort((a, b) => {
      const aKey = (a.name || a.id).toLowerCase();
      const bKey = (b.name || b.id).toLowerCase();
      return aKey.localeCompare(bKey);
    });
  }, [players]);

  const resolvedPlayerLink =
    playerLink || (typeof window !== "undefined" ? window.location.href : "");
  const resolvedSpectatorLink = spectatorLink || resolvedPlayerLink;

  const roomIsLocked = roomLockedByHost || roomIsFull;
  const activeLinkLabel = roomIsLocked ? "Spectator link" : "Player link";
  const activeLinkValue = roomIsLocked
    ? resolvedSpectatorLink
    : resolvedPlayerLink;

  const handleCopy = React.useCallback(async (label: string, value: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied to clipboard`);
    } catch (err) {
      console.error("Failed to copy link", err);
      toast.error("Failed to copy link");
    }
  }, []);

  const lockLabel = roomIsFull
    ? "Room is full (spectators can still join)"
    : roomIsLocked
      ? "Unlock room"
      : "Lock room";

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-[520px] bg-zinc-950 border-zinc-800 text-zinc-100">
        <DialogHeader>
          <DialogTitle>Share room</DialogTitle>
          <DialogDescription className="text-zinc-400">
            Share the link below with players or spectators.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <section className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-zinc-100">
                  Players ({sortedPlayers.length}/{MAX_PLAYERS})
                </p>
                <p className="text-xs text-zinc-500">
                  Players currently in the room
                </p>
              </div>
              <div className="flex items-center gap-2">
                {roomIsLocked && !roomIsFull && (
                  <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Unlock
                  </span>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={lockLabel}
                  title={lockLabel}
                  onClick={onToggleRoomLock}
                  disabled={!isHost || roomIsFull}
                  className="text-zinc-400 hover:text-zinc-100"
                >
                  {roomIsLocked ? <Lock size={16} /> : <Unlock size={16} />}
                </Button>
              </div>
            </div>

            <div className="grid gap-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Players
                </div>
                <ul className="mt-2 space-y-1">
                  {sortedPlayers.length > 0 ? (
                    sortedPlayers.map((player, index) => (
                      <li
                        key={player.id}
                        className="text-sm text-zinc-200"
                      >
                        {formatPlayerName(player, index)}
                      </li>
                    ))
                  ) : (
                    <li className="text-sm text-zinc-500">No players yet</li>
                  )}
                </ul>
              </div>
            </div>

            <div className="border-t border-zinc-800 pt-4">
              <ShareLinkField
                label={activeLinkLabel}
                value={activeLinkValue}
                onCopy={handleCopy}
              />
            </div>
            {!roomIsLocked && (
              <div className="border-t border-zinc-800 pt-4 space-y-2">
                <div className="flex flex-col items-center text-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={onToggleRoomLock}
                    disabled={!isHost}
                    className="border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
                  >
                    Allow spectators?
                  </Button>
                  <p className="text-xs text-zinc-500">
                    Allowing spectators will lock the room so no other player may
                    join
                  </p>
                </div>
              </div>
            )}
          </section>

        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            className="bg-transparent border-zinc-700 hover:bg-zinc-800 text-zinc-300"
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
