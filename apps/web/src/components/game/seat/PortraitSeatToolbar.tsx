import React from "react";
import {
  Heart,
  Layers,
  Minus,
  Plus,
  Skull,
  SquircleDashed,
} from "lucide-react";
import { useDroppable } from "@dnd-kit/core";

import { Dialog, DialogContent, DialogHeader } from "@/components/ui/dialog";
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
  onZoneContextMenu?: (e: React.MouseEvent, zoneId: ZoneId) => void;
  onLoadDeck?: () => void;
  showLoadLibraryAction?: boolean;
}

const TOUCH_CONTEXT_MENU_LONG_PRESS_MS = 500;
const TOUCH_MOVE_TOLERANCE_PX = 10;
const TOUCH_DOUBLE_TAP_MS = 280;
const NATIVE_CLICK_SUPPRESSION_MS = 450;

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
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  onLongPress?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  className?: string;
  dropZoneId?: string;
  dropType?: string;
}> = ({
  icon,
  value,
  label,
  onClick,
  onLongPress,
  disabled,
  className,
  dropZoneId,
  dropType,
}) => {
  const dropTarget = useDroppable({
    id: dropZoneId
      ? `mobile-drop:${dropZoneId}`
      : `mobile-drop:disabled:${label}`,
    disabled: disabled || !dropZoneId,
    data: dropZoneId
      ? {
          zoneId: dropZoneId,
          type: dropType,
        }
      : undefined,
  });
  const touchPressTimeoutRef = React.useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const touchPressRef = React.useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    clientX: number;
    clientY: number;
    target: HTMLButtonElement;
    moved: boolean;
    longPressTriggered: boolean;
  } | null>(null);
  const suppressNativeUntilRef = React.useRef(0);

  const clearTouchPressTimeout = React.useCallback(() => {
    if (touchPressTimeoutRef.current) {
      clearTimeout(touchPressTimeoutRef.current);
      touchPressTimeoutRef.current = null;
    }
  }, []);

  const clearTouchPress = React.useCallback(() => {
    clearTouchPressTimeout();
    touchPressRef.current = null;
  }, [clearTouchPressTimeout]);

  const suppressNativeClick = React.useCallback(() => {
    suppressNativeUntilRef.current = Date.now() + NATIVE_CLICK_SUPPRESSION_MS;
  }, []);

  React.useEffect(() => {
    return () => {
      clearTouchPress();
    };
  }, [clearTouchPress]);

  const handlePointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (!onLongPress) return;
      if (event.pointerType !== "touch") return;
      if (event.button !== 0) return;

      if (
        touchPressRef.current &&
        touchPressRef.current.pointerId !== event.pointerId
      ) {
        clearTouchPress();
      }

      touchPressRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        clientX: event.clientX,
        clientY: event.clientY,
        target: event.currentTarget,
        moved: false,
        longPressTriggered: false,
      };

      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Ignore capture failures on unsupported environments.
      }

      clearTouchPressTimeout();
      touchPressTimeoutRef.current = setTimeout(() => {
        const press = touchPressRef.current;
        if (!press) return;
        if (press.pointerId !== event.pointerId) return;
        if (press.moved) return;
        press.longPressTriggered = true;
        suppressNativeClick();
        onLongPress({
          preventDefault: () => {},
          stopPropagation: () => {},
          clientX: press.clientX,
          clientY: press.clientY,
          currentTarget: press.target,
          target: press.target,
        } as unknown as React.MouseEvent<HTMLButtonElement>);
      }, TOUCH_CONTEXT_MENU_LONG_PRESS_MS);
    },
    [clearTouchPress, clearTouchPressTimeout, onLongPress, suppressNativeClick],
  );

  const handlePointerMove = React.useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (event.pointerType !== "touch") return;
      const press = touchPressRef.current;
      if (!press || press.pointerId !== event.pointerId) return;
      press.clientX = event.clientX;
      press.clientY = event.clientY;
      if (press.moved) return;
      const dx = event.clientX - press.startX;
      const dy = event.clientY - press.startY;
      if (Math.hypot(dx, dy) > TOUCH_MOVE_TOLERANCE_PX) {
        press.moved = true;
        clearTouchPressTimeout();
      }
    },
    [clearTouchPressTimeout],
  );

  const handlePointerEnd = React.useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (event.pointerType !== "touch") return;
      const press = touchPressRef.current;
      if (!press || press.pointerId !== event.pointerId) return;
      press.clientX = event.clientX;
      press.clientY = event.clientY;
      if (
        typeof event.currentTarget.hasPointerCapture === "function" &&
        typeof event.currentTarget.releasePointerCapture === "function" &&
        event.currentTarget.hasPointerCapture(event.pointerId)
      ) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      if (press.longPressTriggered) {
        suppressNativeClick();
      }
      clearTouchPress();
    },
    [clearTouchPress, suppressNativeClick],
  );

  const handlePointerCancel = React.useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (event.pointerType !== "touch") return;
      const press = touchPressRef.current;
      if (!press || press.pointerId !== event.pointerId) return;
      if (
        typeof event.currentTarget.hasPointerCapture === "function" &&
        typeof event.currentTarget.releasePointerCapture === "function" &&
        event.currentTarget.hasPointerCapture(event.pointerId)
      ) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      if (press.longPressTriggered) {
        suppressNativeClick();
      }
      clearTouchPress();
    },
    [clearTouchPress, suppressNativeClick],
  );

  const handleClick = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      if (Date.now() < suppressNativeUntilRef.current) return;
      onClick?.(event);
    },
    [onClick],
  );

  return (
    <button
      ref={dropTarget.setNodeRef}
      type="button"
      className={cn(
        "h-full w-full rounded-lg border border-zinc-700 bg-zinc-900/80 px-2",
        "flex items-center justify-center gap-1.5 text-zinc-200",
        "transition-colors hover:bg-zinc-800/80 disabled:opacity-40 disabled:cursor-not-allowed",
        "touch-manipulation select-none",
        dropTarget.isOver && "ring-2 ring-indigo-400/80 bg-indigo-500/20",
        className,
      )}
      style={{
        userSelect: "none",
        WebkitUserSelect: "none",
        WebkitTouchCallout: "none",
      }}
      onClick={handleClick}
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerCancel}
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
          <div className="flex items-center justify-center gap-4">
            {canEditLife ? (
              <button
                type="button"
                aria-label="Decrease life"
                onClick={() => handleLifeChange(-1)}
                disabled={player.life <= MIN_PLAYER_LIFE}
                className="h-9 w-9 rounded-full border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center"
              >
                <Minus size={16} />
              </button>
            ) : (
              <div className="h-9 w-9" />
            )}
            <div className="min-w-[5rem] text-center text-3xl font-mono font-bold">
              {player.life}
            </div>
            {canEditLife ? (
              <button
                type="button"
                aria-label="Increase life"
                onClick={() => handleLifeChange(1)}
                disabled={player.life >= MAX_PLAYER_LIFE}
                className="h-9 w-9 rounded-full border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center"
              >
                <Plus size={16} />
              </button>
            ) : (
              <div className="h-9 w-9" />
            )}
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
                    {canEditCommanderDamage ? (
                      <button
                        type="button"
                        aria-label={`Decrease commander damage from ${sourceName}`}
                        onClick={() =>
                          handleCommanderDamageChange(entry.opponentId, -1)
                        }
                        disabled={entry.damage <= 0}
                        className="h-7 w-7 rounded-full border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center"
                      >
                        <Minus size={13} />
                      </button>
                    ) : (
                      <div className="h-7 w-7" />
                    )}
                    <div className="min-w-[2rem] text-center font-mono text-lg">
                      {entry.damage}
                    </div>
                    {canEditCommanderDamage ? (
                      <button
                        type="button"
                        aria-label={`Increase commander damage from ${sourceName}`}
                        onClick={() =>
                          handleCommanderDamageChange(entry.opponentId, 1)
                        }
                        className="h-7 w-7 rounded-full border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center"
                      >
                        <Plus size={13} />
                      </button>
                    ) : (
                      <div className="h-7 w-7" />
                    )}
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
  onZoneContextMenu,
  onLoadDeck,
  showLoadLibraryAction = false,
}) => {
  const [lifeDialogOpen, setLifeDialogOpen] = React.useState(false);
  const lastLibraryTapRef = React.useRef<{
    timestamp: number;
    x: number;
    y: number;
  } | null>(null);

  const handleLibraryClick = React.useCallback(
    (event: React.MouseEvent) => {
      if (!library) return;
      if (isMe) {
        if (!onDrawCard) return;
        const now = Date.now();
        const previousTap = lastLibraryTapRef.current;
        const isDoubleTap = Boolean(
          previousTap &&
          now - previousTap.timestamp <= TOUCH_DOUBLE_TAP_MS &&
          Math.hypot(
            event.clientX - previousTap.x,
            event.clientY - previousTap.y,
          ) <= TOUCH_MOVE_TOLERANCE_PX,
        );
        if (isDoubleTap) {
          lastLibraryTapRef.current = null;
          onDrawCard(player.id);
          return;
        }
        lastLibraryTapRef.current = {
          timestamp: now,
          x: event.clientX,
          y: event.clientY,
        };
        return;
      }
      if (!isMe && opponentLibraryRevealCount > 0 && onOpponentLibraryReveals) {
        onOpponentLibraryReveals(library.id);
        return;
      }
      onViewZone?.(library.id);
    },
    [
      isMe,
      library,
      onDrawCard,
      onOpponentLibraryReveals,
      onViewZone,
      opponentLibraryRevealCount,
      player.id,
    ],
  );

  React.useEffect(() => {
    if (!isMe) {
      lastLibraryTapRef.current = null;
    }
  }, [isMe]);

  return (
    <>
      <div className="relative z-20 shrink-0 border-y border-zinc-800/70 bg-zinc-950/85 px-2 py-1.5">
        <div className="grid h-14 grid-cols-[minmax(0,1fr)_minmax(0,3fr)] gap-2">
          <ZoneButton
            icon={<Heart size={16} />}
            label="Open life details"
            value={player.life}
            onClick={() => setLifeDialogOpen(true)}
          />

          {!showLoadLibraryAction ? (
            <div className="grid h-full grid-cols-3 gap-2">
              <ZoneButton
                icon={<Layers size={15} />}
                label="Library"
                value={libraryCount}
                onClick={handleLibraryClick}
                onLongPress={
                  library && onZoneContextMenu
                    ? (event) => onZoneContextMenu(event, library.id)
                    : undefined
                }
                disabled={!library}
                dropZoneId={library?.id}
                dropType={library?.type}
              />
              <ZoneButton
                icon={<Skull size={15} />}
                label="Graveyard"
                value={graveyardCount}
                onClick={() => {
                  if (!graveyard) return;
                  onViewZone?.(graveyard.id);
                }}
                onLongPress={
                  graveyard && onZoneContextMenu
                    ? (event) => onZoneContextMenu(event, graveyard.id)
                    : undefined
                }
                disabled={!graveyard}
                dropZoneId={graveyard?.id}
                dropType={graveyard?.type}
              />
              <ZoneButton
                icon={<SquircleDashed size={15} />}
                label="Exile"
                value={exileCount}
                onClick={() => {
                  if (!exile) return;
                  onViewZone?.(exile.id);
                }}
                onLongPress={
                  exile && onZoneContextMenu
                    ? (event) => onZoneContextMenu(event, exile.id)
                    : undefined
                }
                disabled={!exile}
                dropZoneId={exile?.id}
                dropType={exile?.type}
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={onLoadDeck}
              disabled={!onLoadDeck}
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
