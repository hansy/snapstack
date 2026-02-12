import React from "react";
import { Minus, Plus } from "lucide-react";

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

  return (
    <div
      className={cn(
        "absolute inset-x-0 top-8 bottom-0 z-30 overflow-hidden",
        "transition-transform duration-200 ease-out",
        "border-t border-zinc-700 bg-zinc-950/95 shadow-[0_-14px_40px_rgba(0,0,0,0.55)] backdrop-blur",
        open ? "translate-y-0 pointer-events-auto" : "translate-y-full pointer-events-none",
      )}
      data-no-seat-swipe="true"
    >
      <div className="flex h-full flex-col p-2">
        <div className="shrink-0 border-b border-zinc-800/80 px-3 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
            Commander Zone
          </div>
        </div>
        <div className="min-h-0 flex-1 p-2">
          {zone ? (
            <Zone
              zone={zone}
              className="relative h-full w-full overflow-y-auto rounded-md border border-zinc-800 bg-zinc-900/45 p-3"
              onContextMenu={(e) => onZoneContextMenu?.(e, zone.id)}
            >
              {cards.length > 0 ? (
                <div className="flex min-h-full flex-col gap-3">
                  {cards.map((card, index) => (
                    <div
                      key={card.id}
                      className="grid min-h-[8.5rem] grid-cols-[auto_auto] items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900/65 p-2"
                    >
                      <div className="relative">
                        {index > 0 && (
                          <div className="pointer-events-none absolute -left-1 -top-1 h-full w-full rounded-lg border border-zinc-700/45 bg-zinc-900/35" />
                        )}
                        <Card
                          card={card}
                          className="relative z-10 shadow-lg !h-[128px] !w-[85px] !aspect-auto"
                          disableHoverAnimation
                          onContextMenu={(e) => onCardContextMenu?.(e, card)}
                        />
                      </div>
                      <div className="flex h-full min-w-[3.5rem] flex-col items-center justify-center gap-2">
                        <button
                          type="button"
                          aria-label={`Decrease commander tax for ${card.name}`}
                          onClick={() => handleTaxDelta(card, -2)}
                          disabled={!isOwner || (card.commanderTax ?? 0) <= 0}
                          className={cn(
                            "h-7 w-7 rounded-full border border-zinc-700 bg-zinc-900 text-zinc-300",
                            "flex items-center justify-center hover:bg-zinc-800",
                            "disabled:cursor-not-allowed disabled:opacity-40",
                          )}
                        >
                          <Minus size={13} />
                        </button>
                        <div className="h-8 min-w-[2.5rem] rounded-full border border-zinc-600 bg-zinc-950 px-2 text-center text-sm font-semibold leading-8 text-zinc-100">
                          {card.commanderTax ?? 0}
                        </div>
                        <button
                          type="button"
                          aria-label={`Increase commander tax for ${card.name}`}
                          onClick={() => handleTaxDelta(card, 2)}
                          disabled={!isOwner}
                          className={cn(
                            "h-7 w-7 rounded-full border border-zinc-700 bg-zinc-900 text-zinc-300",
                            "flex items-center justify-center hover:bg-zinc-800",
                            "disabled:cursor-not-allowed disabled:opacity-40",
                          )}
                        >
                          <Plus size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex h-full min-h-[8.5rem] items-center justify-center rounded-md border border-dashed border-zinc-700/70 px-4 text-center text-xs uppercase tracking-wider text-zinc-500">
                  Drop cards here
                </div>
              )}
            </Zone>
          ) : (
            <div className="flex h-full items-center justify-center rounded-md border border-zinc-800 bg-zinc-900/40 text-xs uppercase tracking-wider text-zinc-500">
              Commander zone unavailable
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
