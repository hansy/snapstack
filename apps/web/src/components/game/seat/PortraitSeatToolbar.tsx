import React from "react";
import {
  Heart,
  Layers,
  Minus,
  Plus,
  Skull,
  SquircleDashed,
} from "lucide-react";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useGameStore } from "@/store/gameStore";
import { useLifeBoxController } from "@/hooks/game/player/useLifeBoxController";
import { MAX_PLAYER_LIFE, MIN_PLAYER_LIFE } from "@/lib/limits";
import type { Player, Zone as ZoneType, ZoneId } from "@/types";

interface PortraitSeatToolbarProps {
  player: Player;
  isMe: boolean;
  opponentColors: Record<string, string>;
  library?: ZoneType;
  graveyard?: ZoneType;
  exile?: ZoneType;
  libraryCount: number;
  graveyardCount: number;
  exileCount: number;
  opponentLibraryRevealCount: number;
  onViewZone?: (zoneId: ZoneId, count?: number) => void;
  onDrawCard?: (playerId: string) => void;
  onOpponentLibraryReveals?: (zoneId: ZoneId) => void;
  onLoadDeck?: () => void;
}

const colorTextClass = (color: string | undefined) => {
  if (color === "rose") return "text-rose-300";
  if (color === "violet") return "text-violet-300";
  if (color === "sky") return "text-sky-300";
  if (color === "amber") return "text-amber-300";
  return "text-zinc-200";
};

const ZoneButton: React.FC<{
  icon: React.ReactNode;
  value: React.ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}> = ({ icon, value, label, onClick, disabled, className }) => {
  return (
    <button
      type="button"
      className={cn(
        "h-full w-full rounded-lg border border-zinc-700 bg-zinc-900/80 px-2",
        "flex items-center justify-center gap-1.5 text-zinc-200",
        "transition-colors hover:bg-zinc-800/80 disabled:opacity-40 disabled:cursor-not-allowed",
        className,
      )}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      data-no-seat-swipe="true"
    >
      <span className="text-zinc-400">{icon}</span>
      <span className="text-base font-semibold leading-none">{value}</span>
    </button>
  );
};

const MobileLifeDialog: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  player: Player;
  isMe: boolean;
  opponentColors: Record<string, string>;
}> = ({ open, onOpenChange, player, isMe, opponentColors }) => {
  const players = useGameStore((state) => state.players);
  const updatePlayer = useGameStore((state) => state.updatePlayer);
  const {
    canEditLife,
    canEditCommanderDamage,
    commanderDamageEntries,
    handleLifeChange,
    handleCommanderDamageChange,
  } = useLifeBoxController({
    player,
    isMe,
    opponentColors,
  });
  const [isEditingName, setIsEditingName] = React.useState(false);
  const [nameDraft, setNameDraft] = React.useState(player.name);

  React.useEffect(() => {
    if (!open) {
      setIsEditingName(false);
      setNameDraft(player.name);
    }
  }, [open, player.name]);

  const submitName = React.useCallback(() => {
    if (!isMe) return;
    const next = nameDraft.trim();
    if (!next || next === player.name) {
      setIsEditingName(false);
      setNameDraft(player.name);
      return;
    }
    updatePlayer(player.id, { name: next });
    setIsEditingName(false);
  }, [isMe, nameDraft, player.id, player.name, updatePlayer]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="ds-dialog-size-xs border-zinc-700 bg-zinc-950 text-zinc-100 p-4"
        showCloseButton
      >
        <DialogHeader className="gap-1">
          <DialogTitle className="text-sm text-zinc-400 font-medium uppercase tracking-wider">
            Player
          </DialogTitle>
          {isEditingName ? (
            <div className="flex items-center gap-2">
              <Input
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitName();
                  if (e.key === "Escape") {
                    setIsEditingName(false);
                    setNameDraft(player.name);
                  }
                }}
                autoFocus
                className="h-8 border-zinc-700 bg-zinc-900/70"
              />
              <button
                type="button"
                className="h-8 rounded-md border border-zinc-700 px-2 text-xs hover:bg-zinc-800"
                onClick={submitName}
              >
                Save
              </button>
            </div>
          ) : (
            <button
              type="button"
              className={cn(
                "text-left text-lg font-semibold",
                isMe ? "hover:text-white cursor-pointer" : "cursor-default",
              )}
              onClick={() => {
                if (!isMe) return;
                setIsEditingName(true);
              }}
              disabled={!isMe}
            >
              {player.name || (isMe ? "Me" : "Player")}
            </button>
          )}
        </DialogHeader>

        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
          <div className="mb-2 text-[10px] uppercase tracking-wider text-zinc-500">
            Life Total
          </div>
          <div className="flex items-center justify-center gap-4">
            <button
              type="button"
              aria-label="Decrease life"
              onClick={() => handleLifeChange(-1)}
              disabled={!canEditLife || player.life <= MIN_PLAYER_LIFE}
              className="h-9 w-9 rounded-full border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center"
            >
              <Minus size={16} />
            </button>
            <div className="min-w-[5rem] text-center text-3xl font-mono font-bold">
              {player.life}
            </div>
            <button
              type="button"
              aria-label="Increase life"
              onClick={() => handleLifeChange(1)}
              disabled={!canEditLife || player.life >= MAX_PLAYER_LIFE}
              className="h-9 w-9 rounded-full border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center"
            >
              <Plus size={16} />
            </button>
          </div>
        </div>

        {commanderDamageEntries.length > 0 && (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
            <div className="mb-2 text-[10px] uppercase tracking-wider text-zinc-500">
              Commander Damage
            </div>
            <div className="flex flex-col gap-2">
              {commanderDamageEntries.map((entry) => {
                const sourceName =
                  players[entry.opponentId]?.name || entry.opponentId;
                return (
                  <div
                    key={entry.opponentId}
                    className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-2"
                  >
                    <div
                      className={cn(
                        "truncate text-sm font-medium",
                        colorTextClass(entry.color),
                      )}
                    >
                      {sourceName}
                    </div>
                    <button
                      type="button"
                      aria-label={`Decrease commander damage from ${sourceName}`}
                      onClick={() =>
                        handleCommanderDamageChange(entry.opponentId, -1)
                      }
                      disabled={!canEditCommanderDamage || entry.damage <= 0}
                      className="h-7 w-7 rounded-full border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center"
                    >
                      <Minus size={13} />
                    </button>
                    <div className="min-w-[2rem] text-center font-mono text-lg">
                      {entry.damage}
                    </div>
                    <button
                      type="button"
                      aria-label={`Increase commander damage from ${sourceName}`}
                      onClick={() =>
                        handleCommanderDamageChange(entry.opponentId, 1)
                      }
                      disabled={!canEditCommanderDamage}
                      className="h-7 w-7 rounded-full border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center"
                    >
                      <Plus size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export const PortraitSeatToolbar: React.FC<PortraitSeatToolbarProps> = ({
  player,
  isMe,
  opponentColors,
  library,
  graveyard,
  exile,
  libraryCount,
  graveyardCount,
  exileCount,
  opponentLibraryRevealCount,
  onViewZone,
  onDrawCard,
  onOpponentLibraryReveals,
  onLoadDeck,
}) => {
  const [lifeDialogOpen, setLifeDialogOpen] = React.useState(false);
  const isLibraryLoaded = Boolean(player.deckLoaded);

  const handleLibraryClick = React.useCallback(() => {
    if (!library) return;
    if (isMe && onDrawCard) {
      onDrawCard(player.id);
      return;
    }
    if (!isMe && opponentLibraryRevealCount > 0 && onOpponentLibraryReveals) {
      onOpponentLibraryReveals(library.id);
      return;
    }
    onViewZone?.(library.id);
  }, [
    isMe,
    library,
    onDrawCard,
    onOpponentLibraryReveals,
    onViewZone,
    opponentLibraryRevealCount,
    player.id,
  ]);

  return (
    <>
      <div className="shrink-0 border-y border-zinc-800/70 bg-zinc-950/85 px-2 py-1.5">
        <div className="grid h-14 grid-cols-[minmax(0,1fr)_minmax(0,3fr)] gap-2">
          <ZoneButton
            icon={<Heart size={16} />}
            label="Open life details"
            value={player.life}
            onClick={() => setLifeDialogOpen(true)}
          />

          {isLibraryLoaded ? (
            <div className="grid h-full grid-cols-3 gap-2">
              <ZoneButton
                icon={<Layers size={15} />}
                label="Library"
                value={libraryCount}
                onClick={handleLibraryClick}
                disabled={!library}
              />
              <ZoneButton
                icon={<Skull size={15} />}
                label="Graveyard"
                value={graveyardCount}
                onClick={() => {
                  if (!graveyard) return;
                  onViewZone?.(graveyard.id);
                }}
                disabled={!graveyard}
              />
              <ZoneButton
                icon={<SquircleDashed size={15} />}
                label="Exile"
                value={exileCount}
                onClick={() => {
                  if (!exile) return;
                  onViewZone?.(exile.id);
                }}
                disabled={!exile}
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={onLoadDeck}
              disabled={!isMe || !onLoadDeck}
              data-no-seat-swipe="true"
              aria-label="Load Library"
              className={cn(
                "h-full w-full rounded-lg border border-indigo-500/40 bg-indigo-600/30",
                "flex items-center justify-center gap-2 px-2 text-indigo-100",
                "transition-colors hover:bg-indigo-600/40 disabled:opacity-40 disabled:cursor-not-allowed",
              )}
            >
              <Plus size={16} />
              <span className="text-sm font-semibold">Load Library</span>
            </button>
          )}
        </div>
      </div>
      <MobileLifeDialog
        open={lifeDialogOpen}
        onOpenChange={setLifeDialogOpen}
        player={player}
        isMe={isMe}
        opponentColors={opponentColors}
      />
    </>
  );
};
