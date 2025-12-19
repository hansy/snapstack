import React from "react";

import { cn } from "@/lib/utils";

import type { CardStatKey } from "@/lib/cardPT";

export const CardFacePTBadge: React.FC<{
  showPT: boolean;
  interactive?: boolean;
  displayPower?: string;
  displayToughness?: string;
  powerClassName: string;
  toughnessClassName: string;
  onPTDelta?: (type: CardStatKey, delta: number) => void;
}> = ({
  showPT,
  interactive,
  displayPower,
  displayToughness,
  powerClassName,
  toughnessClassName,
  onPTDelta,
}) => {
  if (!showPT) return null;

  return (
    <div
      className={cn(
        "absolute bottom-1 right-1 bg-zinc-900/90 px-2 py-1 rounded-sm border border-zinc-700 shadow-sm z-10",
        interactive && "scale-125 origin-bottom-right"
      )}
    >
      <span className="text-sm font-bold flex items-center gap-1">
        {/* Power */}
        <div className="relative group/pt">
          <span className={cn(powerClassName)}>{displayPower}</span>
          {interactive && (
            <div className="absolute -top-6 left-1/2 -translate-x-1/2 flex gap-1 opacity-0 group-hover/pt:opacity-100 transition-opacity bg-zinc-900 border border-zinc-700 rounded px-1">
              <button
                type="button"
                aria-label="Increase power"
                className="text-xs hover:text-green-400 px-1"
                onClick={(e) => {
                  e.stopPropagation();
                  onPTDelta?.("power", 1);
                }}
              >
                +
              </button>
              <button
                type="button"
                aria-label="Decrease power"
                className="text-xs hover:text-red-400 px-1"
                onClick={(e) => {
                  e.stopPropagation();
                  onPTDelta?.("power", -1);
                }}
              >
                -
              </button>
            </div>
          )}
        </div>

        <span className="text-zinc-400">/</span>

        {/* Toughness */}
        <div className="relative group/pt">
          <span className={cn(toughnessClassName)}>{displayToughness}</span>
          {interactive && (
            <div className="absolute -top-6 left-1/2 -translate-x-1/2 flex gap-1 opacity-0 group-hover/pt:opacity-100 transition-opacity bg-zinc-900 border border-zinc-700 rounded px-1">
              <button
                type="button"
                aria-label="Increase toughness"
                className="text-xs hover:text-green-400 px-1"
                onClick={(e) => {
                  e.stopPropagation();
                  onPTDelta?.("toughness", 1);
                }}
              >
                +
              </button>
              <button
                type="button"
                aria-label="Decrease toughness"
                className="text-xs hover:text-red-400 px-1"
                onClick={(e) => {
                  e.stopPropagation();
                  onPTDelta?.("toughness", -1);
                }}
              >
                -
              </button>
            </div>
          )}
        </div>
      </span>
    </div>
  );
};

