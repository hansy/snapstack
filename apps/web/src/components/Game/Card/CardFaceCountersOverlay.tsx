import React from "react";

import { cn } from "@/lib/utils";

import type { CardFaceCounterModel } from "@/models/game/card/cardFaceModel";

export const CardFaceCountersOverlay: React.FC<{
  counters: CardFaceCounterModel[];
  countersClassName?: string;
  interactive?: boolean;
  showCounterLabels?: boolean;
  onIncrementCounter?: (counter: Pick<CardFaceCounterModel, "type" | "color">) => void;
  onDecrementCounter?: (counterType: string) => void;
  customTextNode?: React.ReactNode;
  customTextPosition?: "sidebar" | "bottom-left" | "center";
}> = ({
  counters,
  countersClassName,
  interactive,
  showCounterLabels,
  onIncrementCounter,
  onDecrementCounter,
  customTextNode,
  customTextPosition,
}) => {
  const showSidebarCustomText = customTextNode && customTextPosition === "sidebar";
  if (counters.length === 0 && !showSidebarCustomText) return null;

  return (
    <div
      className={cn(
        "absolute top-0 right-0 flex flex-col gap-1 items-end pr-1 pt-1",
        countersClassName
      )}
    >
      {counters.map((counter) => (
        <div
          key={counter.type}
          className="group relative flex items-center justify-center w-6 h-6 rounded-full shadow-md border border-white/20 text-white text-[10px] font-bold cursor-help transition-all hover:z-50"
          style={{ backgroundColor: counter.renderColor }}
        >
          {counter.count}

          {/* Label and Buttons (Controlled by showCounterLabels) */}
          {showCounterLabels ? (
            <div className="absolute left-full top-1/2 -translate-y-1/2 pl-2 flex items-center gap-1 h-full z-50">
              {/* Buttons - Only if interactive */}
              {interactive && (
                <div className="flex items-center gap-0.5 w-0 overflow-hidden group-hover:w-auto transition-all duration-200 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto">
                  <button
                    type="button"
                    aria-label={`Decrement ${counter.type} counter`}
                    className="w-5 h-5 flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 rounded text-white text-xs border border-zinc-600"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDecrementCounter?.(counter.type);
                    }}
                  >
                    -
                  </button>
                  <button
                    type="button"
                    aria-label={`Increment ${counter.type} counter`}
                    className="w-5 h-5 flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 rounded text-white text-xs border border-zinc-600"
                    onClick={(e) => {
                      e.stopPropagation();
                      onIncrementCounter?.(counter);
                    }}
                  >
                    +
                  </button>
                </div>
              )}

              {/* Label */}
              <div className="bg-zinc-900/90 text-zinc-100 text-xs px-2 py-1 rounded border border-zinc-700 whitespace-nowrap shadow-lg pointer-events-none group-hover:pointer-events-auto">
                {counter.type}
              </div>
            </div>
          ) : (
            /* Tooltip for non-interactive mode (Battlefield) */
            <div className="absolute right-full mr-2 px-2 py-1 bg-zinc-900 text-zinc-100 text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50 border border-zinc-700">
              {counter.type}
            </div>
          )}
        </div>
      ))}

      {/* Sidebar Custom Text */}
      {showSidebarCustomText && (
        <div className="relative w-6 h-0 flex items-center justify-center">
          <div className="absolute left-full pl-2 top-0">{customTextNode}</div>
        </div>
      )}
    </div>
  );
};

