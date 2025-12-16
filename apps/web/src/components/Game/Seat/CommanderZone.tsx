import React from "react";
import { cn } from "../../../lib/utils";
import { Zone as ZoneType, Card as CardType, ZoneId } from "../../../types";
import { Card } from "../Card/Card";
import { Zone } from "../Zone/Zone";
import { useGameStore } from "../../../store/gameStore";

interface CommanderZoneProps {
  zone: ZoneType;
  cards: CardType[];
  isTop: boolean;
  isRight: boolean;
  onZoneContextMenu?: (e: React.MouseEvent, zoneId: ZoneId) => void;
  scale?: number;
  color?: string;
}

export const CommanderZone: React.FC<CommanderZoneProps> = ({
  zone,
  cards,
  isTop,
  isRight,
  onZoneContextMenu,
  scale = 1,
  color,
}) => {
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
        {/* Commander Tax Counter */}
        {/* Container for hover zone - wider to accommodate buttons */}
        <div
          className={cn(
            "absolute top-1 z-40 flex items-center justify-center group/tax",
            // Position on the edge shared with Hand zone
            isRight ? "left-0 -translate-x-1/2" : "right-0 translate-x-1/2"
          )}
        >
          {/* Label */}
          <div
            className={cn(
              "absolute text-md font-bold text-zinc-400 uppercase tracking-wider bg-zinc-900/80 px-2 py-0.5 rounded-full border border-zinc-700/50 backdrop-blur-sm shadow-sm whitespace-nowrap opacity-0 group-hover/tax:opacity-100 transition-opacity pointer-events-none",
              isTop ? "top-full mt-2" : "bottom-full mb-2"
            )}
          >
            Tax
          </div>

          {/* Hover Zone Container */}
          <div
            className={cn(
              "flex items-center bg-transparent rounded-full transition-all p-1 gap-1 border border-transparent",
              // Only show hover effects if it's my zone
              useGameStore.getState().myPlayerId === zone.ownerId &&
                "hover:bg-zinc-900/90 hover:border-zinc-700/50 hover:backdrop-blur-sm"
            )}
          >
            {/* Decrement Button (Hidden until hover, only for owner) */}
            {useGameStore.getState().myPlayerId === zone.ownerId && (
              <button
                className={cn(
                  "w-10 h-10 flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 rounded-full text-white text-base border border-zinc-600 opacity-0 group-hover/tax:opacity-100 transition-opacity pointer-events-none group-hover/tax:pointer-events-auto",
                  (useGameStore.getState().players[zone.ownerId]
                    ?.commanderTax || 0) <= 0 &&
                    "opacity-0 cursor-not-allowed pointer-events-none"
                )}
                disabled={
                  (useGameStore.getState().players[zone.ownerId]
                    ?.commanderTax || 0) <= 0
                }
                onClick={(e) => {
                  e.stopPropagation();
                  useGameStore.getState().updateCommanderTax(zone.ownerId, -2);
                }}
              >
                -2
              </button>
            )}

            {/* Counter Value */}
            <div className="bg-zinc-900 border-2 border-zinc-600 rounded-full w-10 h-10 flex items-center justify-center text-base font-bold text-zinc-200 shadow-lg z-10">
              {useGameStore(
                (state) => state.players[zone.ownerId]?.commanderTax || 0
              )}
            </div>

            {/* Increment Button (Hidden until hover, only for owner) */}
            {useGameStore.getState().myPlayerId === zone.ownerId && (
              <button
                className="w-10 h-10 flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 rounded-full text-white text-base border border-zinc-600 opacity-0 group-hover/tax:opacity-100 transition-opacity pointer-events-none group-hover/tax:pointer-events-auto"
                onClick={(e) => {
                  e.stopPropagation();
                  useGameStore.getState().updateCommanderTax(zone.ownerId, 2);
                }}
              >
                +2
              </button>
            )}
          </div>
        </div>

        <Zone
          zone={zone}
          className={cn(
            "h-full aspect-[11/15]",
            "flex items-center justify-center relative shadow-lg backdrop-blur-sm p-2",
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
          {cards.length > 0 ? (
            <Card card={cards[0]} className="w-full h-full" />
          ) : (
            <div className="flex flex-col items-center justify-center text-white/30 gap-1">
              <span className="text-md font-medium uppercase tracking-widest">
                Cmdr
              </span>
            </div>
          )}
        </Zone>
      </div>
    </div>
  );
};
