import React from "react";
import { Minus, Plus } from "lucide-react";
import { useDndContext } from "@dnd-kit/core";

import { Card } from "@/components/game/card/Card";
import { Zone } from "@/components/game/zone/Zone";
import { useCommanderZoneController } from "@/hooks/game/seat/useCommanderZoneController";
import { cn } from "@/lib/utils";
import type { Card as CardType, Zone as ZoneType, ZoneId } from "@/types";

interface PortraitCommanderDrawerProps {
  open: boolean;
  zone?: ZoneType;
  cards: CardType[];
  onZoneContextMenu?: (e: React.MouseEvent, zoneId: ZoneId) => void;
  onCardContextMenu?: (e: React.MouseEvent, card: CardType) => void;
}

const MAX_COMMANDER_CARDS = 2;

export const PortraitCommanderDrawer: React.FC<PortraitCommanderDrawerProps> = ({
  open,
  zone,
  cards,
  onZoneContextMenu,
  onCardContextMenu,
}) => {
  const { isOwner, handleTaxDelta } = useCommanderZoneController({
    zoneOwnerId: zone?.ownerId ?? "",
  });
  const { over } = useDndContext();
  const isDropHoveringCommander = Boolean(
    open && zone && (over?.id === zone.id || over?.data.current?.zoneId === zone.id),
  );
  const visibleCards = cards.slice(-MAX_COMMANDER_CARDS);
  const layoutVars = {
    ["--cmdr-slot-w" as string]: "max(var(--card-w,80px),7.5rem)",
    ["--cmdr-slot-gap" as string]: "0.75rem",
  } as React.CSSProperties;

  return (
    <div
      className={cn(
        "absolute inset-x-0 top-8 bottom-0 z-30 overflow-hidden",
        "transition-transform duration-200 ease-out",
        "border-t border-zinc-700 bg-zinc-950/95 shadow-[0_-14px_40px_rgba(0,0,0,0.55)] backdrop-blur",
        isDropHoveringCommander && "ring-2 ring-inset ring-indigo-400/85 bg-indigo-950/30",
        open ? "translate-y-0 pointer-events-auto" : "translate-y-full pointer-events-none",
      )}
      data-no-seat-swipe="true"
      style={layoutVars}
    >
      {zone ? (
        <Zone
          zone={zone}
          className="relative h-full w-full overflow-hidden border-t border-zinc-800 bg-zinc-900/45 p-3 pt-8"
          onContextMenu={(e) => onZoneContextMenu?.(e, zone.id)}
        >
          <div className="pointer-events-none absolute left-3 top-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
            Commander Zone
          </div>
          {visibleCards.length > 0 ? (
            <div className="flex h-full w-full items-center justify-center gap-[var(--cmdr-slot-gap)]">
              {visibleCards.map((card) => {
                const taxValue = card.commanderTax ?? 0;
                return (
                  <div
                    key={card.id}
                    className="relative flex h-full min-h-0 w-[var(--cmdr-slot-w)] items-center justify-center"
                  >
                    <div className="relative h-[var(--card-h,120px)] w-[var(--card-w,80px)]">
                      <Card
                        card={card}
                        className="shadow-lg !h-full !w-full !aspect-auto"
                        disableHoverAnimation
                        onContextMenu={(e) => onCardContextMenu?.(e, card)}
                      />
                      <div className="pointer-events-auto absolute bottom-0 left-1/2 z-40 flex w-[var(--cmdr-slot-w)] -translate-x-1/2 translate-y-[35%] justify-center">
                        <div className="flex items-center gap-1 rounded-full border border-zinc-600 bg-zinc-950/90 px-1 py-1 shadow-lg">
                          {isOwner && (
                            <button
                              type="button"
                              aria-label={`Decrease commander tax for ${card.name}`}
                              onClick={() => handleTaxDelta(card, -2)}
                              disabled={taxValue <= 0}
                              className={cn(
                                "h-6 w-6 rounded-full border border-zinc-700 bg-zinc-900 text-zinc-300",
                                "flex items-center justify-center hover:bg-zinc-800",
                                "disabled:cursor-not-allowed disabled:opacity-40",
                              )}
                            >
                              <Minus size={12} />
                            </button>
                          )}
                          <div className="flex h-6 min-w-[2rem] items-center justify-center rounded-full border border-zinc-600 bg-zinc-950 px-2 text-center text-xs font-semibold text-zinc-100">
                            {taxValue}
                          </div>
                          {isOwner && (
                            <button
                              type="button"
                              aria-label={`Increase commander tax for ${card.name}`}
                              onClick={() => handleTaxDelta(card, 2)}
                              className={cn(
                                "h-6 w-6 rounded-full border border-zinc-700 bg-zinc-900 text-zinc-300",
                                "flex items-center justify-center hover:bg-zinc-800",
                                "disabled:cursor-not-allowed disabled:opacity-40",
                              )}
                            >
                              <Plus size={12} />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex h-full items-center justify-center rounded-md border border-dashed border-zinc-700/70 px-4 text-center text-xs uppercase tracking-wider text-zinc-500">
              {isOwner ? "Drop cards here" : "Cmdr"}
            </div>
          )}
        </Zone>
      ) : (
        <div className="flex h-full items-center justify-center rounded-md border border-zinc-800 bg-zinc-900/40 text-xs uppercase tracking-wider text-zinc-500">
          Commander zone unavailable
        </div>
      )}
    </div>
  );
};
