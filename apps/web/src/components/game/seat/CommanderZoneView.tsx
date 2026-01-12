import React from "react";

import { cn } from "@/lib/utils";
import type { Zone as ZoneType, Card as CardType, ZoneId } from "@/types";
import { Card } from "../card/Card";
import { Zone } from "../zone/Zone";

import type { CommanderZoneController } from "@/hooks/game/seat/useCommanderZoneController";

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
  const MAX_STACK_CARDS = 4;
  const STACK_OFFSET_PX = 36;
  const stackCards = cards.slice(-MAX_STACK_CARDS);

  return (
    <div
      className={cn(
        "relative z-30 h-full shrink-0", // Increased z-index to sit above Hand
        isRight ? "border-r border-white/5" : "border-l border-white/5" // Separator
      )}
    >
      <div
        className="relative group h-full w-full"
        onContextMenu={(e) => onZoneContextMenu?.(e, zone.id)}
      >
        <Zone
          zone={zone}
          className={cn(
            "h-full aspect-[11/15]",
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
                const yOffset = index * STACK_OFFSET_PX;
                return (
                  <div
                    key={card.id}
                    className="absolute left-0 w-full h-full group/commander-card"
                    style={{ top: yOffset, zIndex: index + 1 }}
                  >
                    <Card card={card} className="w-full h-full" />
                    <div className="absolute right-0 top-2 translate-x-1/2 z-40 pointer-events-none group-hover/commander-card:pointer-events-auto">
                      <div className="relative flex items-center justify-center w-[112px] h-8">
                        {isOwner && (
                          <button
                            type="button"
                            aria-label={`Decrease commander tax for ${card.name}`}
                            className={cn(
                              "absolute left-0 w-8 h-8 flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 rounded-full text-white text-xs border border-zinc-600 opacity-0 scale-90 group-hover/commander-card:opacity-100 group-hover/commander-card:scale-100 transition-all pointer-events-none group-hover/commander-card:pointer-events-auto",
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
                        <div className="bg-zinc-950 border-2 border-zinc-500 rounded-full w-8 h-8 flex items-center justify-center text-xs font-bold text-white shadow-lg ring-1 ring-black/50 pointer-events-none">
                          {taxValue}
                        </div>
                        {isOwner && (
                          <button
                            type="button"
                            aria-label={`Increase commander tax for ${card.name}`}
                            className="absolute right-0 w-8 h-8 flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 rounded-full text-white text-xs border border-zinc-600 opacity-0 scale-90 group-hover/commander-card:opacity-100 group-hover/commander-card:scale-100 transition-all pointer-events-none group-hover/commander-card:pointer-events-auto"
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
