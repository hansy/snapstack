import React from "react";

import { cn } from "@/lib/utils";
import type { Zone as ZoneType, Card as CardType, ZoneId } from "@/types";
import { Card } from "../card/Card";
import { Zone } from "../zone/Zone";

import type { CommanderZoneController } from "@/hooks/game/seat/useCommanderZoneController";

const TOUCH_CONTEXT_MENU_LONG_PRESS_MS = 500;
const TOUCH_MOVE_TOLERANCE_PX = 10;

type TouchPressState = {
  pointerId: number;
  startX: number;
  startY: number;
  clientX: number;
  clientY: number;
  target: HTMLDivElement;
  moved: boolean;
};

export interface CommanderZoneViewProps extends CommanderZoneController {
  zone: ZoneType;
  cards: CardType[];
  isTop: boolean;
  isRight: boolean;
  onZoneContextMenu?: (e: React.MouseEvent, zoneId: ZoneId) => void;
  scale?: number;
  color?: string;
}

export const CommanderZoneView: React.FC<CommanderZoneViewProps> = ({
  zone,
  cards,
  isRight,
  onZoneContextMenu,
  scale = 1,
  color,
  isOwner,
  handleTaxDelta,
}) => {
  const MAX_STACK_CARDS = 2;
  const STACK_OFFSET_PX = 36;
  const stackCards = cards.slice(-MAX_STACK_CARDS);
  const stackOffset = `var(--cmdr-offset, ${STACK_OFFSET_PX}px)`;
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const [activeTaxCardId, setActiveTaxCardId] = React.useState<string | null>(null);
  const touchPressTimeoutRef = React.useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const touchPressRef = React.useRef<TouchPressState | null>(null);

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

  const handleTouchContextMenuStart = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!onZoneContextMenu) return;
      if (event.pointerType !== "touch") return;
      if (event.button !== 0) return;
      if (event.target instanceof HTMLElement) {
        if (event.target.closest("[data-card-id]")) return;
        if (event.target.closest("button")) return;
      }

      if (
        touchPressRef.current &&
        touchPressRef.current.pointerId !== event.pointerId
      ) {
        clearTouchPress();
        return;
      }

      const press: TouchPressState = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        clientX: event.clientX,
        clientY: event.clientY,
        target: event.currentTarget,
        moved: false,
      };
      touchPressRef.current = press;
      clearTouchPressTimeout();
      touchPressTimeoutRef.current = setTimeout(() => {
        const currentPress = touchPressRef.current;
        if (!currentPress) return;
        if (currentPress.pointerId !== press.pointerId) return;
        if (currentPress.moved) return;
        touchPressTimeoutRef.current = null;
        onZoneContextMenu(
          {
            preventDefault: () => {},
            stopPropagation: () => {},
            clientX: currentPress.clientX,
            clientY: currentPress.clientY,
            currentTarget: currentPress.target,
            target: currentPress.target,
          } as unknown as React.MouseEvent,
          zone.id
        );
      }, TOUCH_CONTEXT_MENU_LONG_PRESS_MS);
    },
    [clearTouchPress, clearTouchPressTimeout, onZoneContextMenu, zone.id]
  );

  const handleTouchContextMenuMove = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
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
    [clearTouchPressTimeout]
  );

  const handleTouchContextMenuEnd = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.pointerType !== "touch") return;
      const press = touchPressRef.current;
      if (!press || press.pointerId !== event.pointerId) return;
      clearTouchPress();
    },
    [clearTouchPress]
  );

  React.useEffect(() => {
    return () => {
      clearTouchPress();
    };
  }, [clearTouchPress]);

  React.useEffect(() => {
    if (!activeTaxCardId) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current?.contains(target)) return;
      setActiveTaxCardId(null);
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [activeTaxCardId]);

  return (
    <div
      ref={rootRef}
      className={cn(
        "relative z-30 h-full shrink-0 flex items-stretch justify-start aspect-[11/15]", // Increased z-index to sit above Hand
        isRight ? "border-r border-white/5" : "border-l border-white/5" // Separator
      )}
    >
      <div
        className="relative group h-full w-full"
        onContextMenu={(e) => onZoneContextMenu?.(e, zone.id)}
        onPointerDown={handleTouchContextMenuStart}
        onPointerMove={handleTouchContextMenuMove}
        onPointerUp={handleTouchContextMenuEnd}
        onPointerCancel={handleTouchContextMenuEnd}
        onPointerLeave={handleTouchContextMenuEnd}
      >
        <Zone
          zone={zone}
          className={cn(
            "h-full w-full",
            "flex items-start justify-center relative shadow-lg backdrop-blur-sm p-2 overflow-visible",
            // Base background
            "bg-zinc-900/40",
            // Color variants for background tint
            color === "rose" && "bg-rose-950/40 border-rose-900/30",
            color === "violet" && "bg-violet-950/40 border-violet-900/30",
            color === "sky" && "bg-sky-950/40 border-sky-900/30",
            color === "amber" && "bg-amber-950/40 border-amber-900/30"
          )}
          scale={scale}
        >
          {stackCards.length > 0 ? (
            <div
              className="relative w-full h-full"
              style={{ clipPath: "inset(0 -1000px 0 -1000px)" }}
            >
              {stackCards.map((card, index) => {
                const taxValue = card.commanderTax ?? 0;
                const canDecrement = taxValue > 0;
                const taxControlsVisible = activeTaxCardId === card.id;
                return (
                  <div
                    key={card.id}
                    className="absolute left-0 w-full h-full group/commander-card"
                    style={{
                      top: `calc(${index} * ${stackOffset})`,
                      zIndex: index + 1,
                    }}
                  >
                    <Card
                      card={card}
                      className="w-full h-full lg:!w-full lg:!h-full"
                    />
                    <div className="absolute right-0 top-2 translate-x-1/2 z-40 pointer-events-auto">
                      <div className="relative flex items-center justify-center w-[112px] h-8">
                        {isOwner && (
                          <button
                            type="button"
                            aria-label={`Decrease commander tax for ${card.name}`}
                            className={cn(
                              "absolute left-0 w-8 h-8 flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 rounded-full text-white text-xs border border-zinc-600 transition-all",
                              taxControlsVisible
                                ? "opacity-100 scale-100 pointer-events-auto"
                                : "opacity-0 scale-90 pointer-events-none group-hover/commander-card:opacity-100 group-hover/commander-card:scale-100 group-hover/commander-card:pointer-events-auto",
                              !canDecrement && "opacity-0 cursor-not-allowed pointer-events-none"
                            )}
                            disabled={!canDecrement}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleTaxDelta(card, -2);
                            }}
                          >
                            -2
                          </button>
                        )}
                        <div
                          className={cn(
                            "bg-zinc-950 border-2 border-zinc-500 rounded-full w-8 h-8 flex items-center justify-center text-xs font-bold text-white shadow-lg ring-1 ring-black/50 pointer-events-auto",
                            taxControlsVisible && "border-indigo-300 ring-indigo-300/70"
                          )}
                          onPointerDown={(e) => {
                            if (e.pointerType !== "touch") return;
                            e.stopPropagation();
                            setActiveTaxCardId(card.id);
                          }}
                        >
                          {taxValue}
                        </div>
                        {isOwner && (
                          <button
                            type="button"
                            aria-label={`Increase commander tax for ${card.name}`}
                            className={cn(
                              "absolute right-0 w-8 h-8 flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 rounded-full text-white text-xs border border-zinc-600 transition-all",
                              taxControlsVisible
                                ? "opacity-100 scale-100 pointer-events-auto"
                                : "opacity-0 scale-90 pointer-events-none group-hover/commander-card:opacity-100 group-hover/commander-card:scale-100 group-hover/commander-card:pointer-events-auto"
                            )}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleTaxDelta(card, 2);
                            }}
                          >
                            +2
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-white/30 gap-1">
              <span className="text-md font-medium uppercase tracking-widest">Cmdr</span>
            </div>
          )}
        </Zone>
      </div>
    </div>
  );
};
