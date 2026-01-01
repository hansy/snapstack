import React from "react";
import { Minus, Plus } from "lucide-react";

import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import type { LifeBoxController } from "@/hooks/game/player/useLifeBoxController";

export const LifeBoxView: React.FC<LifeBoxController> = ({
  player,
  isMe,
  className,
  isRight,
  onEditUsername,
  onContextMenu,
  canEditLife,
  canEditCommanderDamage,
  showCommanderDamageDrawer,
  commanderDamageEntries,
  handleLifeChange,
  handleCommanderDamageChange,
}) => {
  return (
    <div
      className={cn(
        "w-32 h-24 flex flex-col items-center justify-center p-2 bg-zinc-800/30 rounded-lg border-2 border-zinc-700 shadow-lg backdrop-blur-sm relative",
        isMe && "border-indigo-500/50 ring-1 ring-indigo-500/20",
        className
      )}
    >
      {/* Player Name Label */}
      <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
        {isMe && onEditUsername ? (
          <Tooltip content="Click to edit username" placement="top">
            <button
              type="button"
              onClick={onEditUsername}
              className={cn(
                "bg-zinc-900 px-2 text-md font-bold text-zinc-400 uppercase tracking-wider whitespace-nowrap border border-zinc-700 rounded-full shadow-sm",
                "cursor-pointer hover:text-zinc-200 hover:border-zinc-500 transition-colors"
              )}
            >
              {player.name || "Me"}
            </button>
          </Tooltip>
        ) : (
          <div className="bg-zinc-900 px-2 text-md font-bold text-zinc-400 uppercase tracking-wider whitespace-nowrap border border-zinc-700 rounded-full shadow-sm">
            {player.name || (isMe ? "Me" : "")}
          </div>
        )}
      </div>

      <div className="group w-full flex flex-col items-center justify-center">
        {/* Main Life Counter */}
        <div className="flex items-center gap-1">
          {canEditLife ? (
            <button
              type="button"
              aria-label="Decrease life"
              onClick={() => handleLifeChange(-1)}
              disabled={player.life <= 0}
              className={cn(
                "w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center transition-all opacity-0 group-hover:opacity-100",
                player.life <= 0
                  ? "opacity-50 cursor-not-allowed text-zinc-500"
                  : "hover:bg-red-900/50"
              )}
            >
              <Minus size={16} />
            </button>
          ) : (
            <div className="w-8 h-8" />
          )}

          <div
            className="text-4xl font-bold font-mono text-center leading-none select-none"
            onContextMenu={canEditLife ? onContextMenu : undefined}
          >
            {player.life}
          </div>

          {canEditLife ? (
            <button
              type="button"
              aria-label="Increase life"
              onClick={() => handleLifeChange(1)}
              className="w-8 h-8 rounded-full bg-zinc-700 hover:bg-green-900/50 flex items-center justify-center transition-all opacity-0 group-hover:opacity-100"
            >
              <Plus size={16} />
            </button>
          ) : (
            <div className="w-8 h-8" />
          )}
        </div>

        {/* Commander Damage Drawer */}
        {showCommanderDamageDrawer && (
          <div
            className={cn(
              "absolute top-1/2 -translate-y-1/2 h-auto py-4 px-4 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl backdrop-blur-sm",
              "flex flex-col gap-3 transition-all duration-200 ease-in-out",
              "opacity-0 invisible group-hover:opacity-100 group-hover:visible",
              // Position based on seat side
              isRight
                ? "right-full mr-4 origin-right"
                : "left-full ml-4 origin-left"
            )}
          >
            {/* Label straddling top border */}
            <div className="absolute left-1/2 -translate-x-1/2 bg-zinc-900 px-2 text-xs font-bold text-zinc-500 uppercase tracking-wider whitespace-nowrap border border-zinc-700 rounded-full z-10 -top-2.5 shadow-sm">
              CMDR DMG
            </div>

            {commanderDamageEntries.map(({ opponentId, color, damage }) => (
              <div
                key={opponentId}
                className="flex items-center justify-center gap-4 group/cmd"
              >
                {canEditCommanderDamage ? (
                  <button
                    type="button"
                    aria-label={`Decrease commander damage from ${opponentId}`}
                    onClick={() => handleCommanderDamageChange(opponentId, -1)}
                    disabled={damage <= 0}
                    className={cn(
                      "w-8 h-8 flex items-center justify-center rounded-full bg-zinc-800 transition-colors",
                      damage <= 0
                        ? "opacity-50 text-zinc-600"
                        : "hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200"
                    )}
                  >
                    <Minus size={14} />
                  </button>
                ) : (
                  <div className="w-8 h-8" />
                )}

                <span
                  className={cn(
                    "text-xl font-mono font-bold w-8 text-center",
                    color === "rose" && "text-rose-500/70",
                    color === "violet" && "text-violet-500/70",
                    color === "sky" && "text-sky-500/70",
                    color === "amber" && "text-amber-500/70"
                  )}
                >
                  {damage}
                </span>

                {canEditCommanderDamage ? (
                  <button
                    type="button"
                    aria-label={`Increase commander damage from ${opponentId}`}
                    onClick={() => handleCommanderDamageChange(opponentId, 1)}
                    className="w-8 h-8 flex items-center justify-center rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors"
                  >
                    <Plus size={14} />
                  </button>
                ) : (
                  <div className="w-8 h-8" />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
