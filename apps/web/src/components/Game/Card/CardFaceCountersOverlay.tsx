import React from "react";

import { Tooltip } from "@/components/ui/tooltip";
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
      {counters.map((counter) => {
        const counterBadge = (
          <div
            className="group relative flex items-center justify-center w-6 h-6 rounded-full shadow-md border border-white/20 text-white text-[10px] font-bold cursor-help transition-all hover:z-50"
            style={{ backgroundColor: counter.renderColor }}
          >
            {counter.count}

            {/* Label and Buttons (Controlled by showCounterLabels) */}
            {showCounterLabels && (
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
            )}
          </div>
        );

        if (showCounterLabels)
          return <React.Fragment key={counter.type}>{counterBadge}</React.Fragment>;

        return (
          <Tooltip key={counter.type} content={counter.type} placement="left">
            {counterBadge}
          </Tooltip>
        );
      })}

      {/* Sidebar Custom Text */}
      {showSidebarCustomText && (
        <div className="relative w-6 h-0 flex items-center justify-center">
          <div className="absolute left-full pl-2 top-0">{customTextNode}</div>
        </div>
      )}
    </div>
  );
};
