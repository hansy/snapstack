import React from "react";
import { Player } from "../../../types";
import { cn } from "../../../lib/utils";
import { useGameStore } from "../../../store/gameStore";
import { Plus, Minus } from "lucide-react";

interface LifeBoxProps {
  player: Player;
  isMe?: boolean;
  className?: string;
  opponentColors: Record<string, string>; // Map of playerId -> color
}

export const LifeBox: React.FC<LifeBoxProps> = ({
  player,
  isMe,
  className,
  opponentColors,
}) => {
  const updatePlayer = useGameStore((state) => state.updatePlayer);

  const handleLifeChange = (amount: number) => {
    updatePlayer(player.id, { life: player.life + amount });
  };

  const handleCommanderDamageChange = (sourceId: string, amount: number) => {
    const currentDamage = player.commanderDamage[sourceId] || 0;
    const newDamage = Math.max(0, currentDamage + amount);

    // Logic: +1 Commander Damage -> -1 Life
    // Logic: -1 Commander Damage -> +1 Life
    // Only apply life change if damage actually changed
    if (newDamage !== currentDamage) {
      const lifeChange = -(newDamage - currentDamage);

      updatePlayer(player.id, {
        life: player.life + lifeChange,
        commanderDamage: {
          ...player.commanderDamage,
          [sourceId]: newDamage,
        },
      });
    }
  };

  return (
    <div
      className={cn(
        "w-32 h-24 flex flex-col items-center justify-center p-2 bg-zinc-800/30 rounded-lg border-2 border-zinc-700 shadow-lg backdrop-blur-sm group relative",
        isMe && "border-indigo-500/50 ring-1 ring-indigo-500/20",
        className
      )}
    >
      {/* Player Name Label */}
      <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-zinc-900 px-2 text-md font-bold text-zinc-400 uppercase tracking-wider whitespace-nowrap border border-zinc-700 rounded-full z-10 shadow-sm">
        {player.name}
      </div>
      {/* Main Life Counter */}
      <div className="flex items-center gap-[10px] mb-1">
        <button
          onClick={() => handleLifeChange(-1)}
          className="w-6 h-6 rounded-full bg-zinc-700 hover:bg-red-900/50 flex items-center justify-center transition-all opacity-0 group-hover:opacity-100"
        >
          <Minus size={12} />
        </button>

        <div className="text-3xl font-bold font-mono text-center leading-none">
          {player.life}
        </div>

        <button
          onClick={() => handleLifeChange(1)}
          className="w-6 h-6 rounded-full bg-zinc-700 hover:bg-green-900/50 flex items-center justify-center transition-all opacity-0 group-hover:opacity-100"
        >
          <Plus size={12} />
        </button>
      </div>

      {/* Commander Damage Rows */}
      <div className="flex gap-3 mt-1">
        {Object.entries(opponentColors).map(([opponentId, color]) => {
          // Don't show own commander damage tracking (usually)
          if (opponentId === player.id) return null;

          const damage = player.commanderDamage[opponentId] || 0;

          return (
            <div
              key={opponentId}
              className="flex flex-col items-center gap-0.5 group/cmd"
            >
              <div className={`w-2 h-2 rounded-full bg-${color}-500`} />
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleCommanderDamageChange(opponentId, -1)}
                  className="text-zinc-600 hover:text-zinc-300 opacity-0 group-hover/cmd:opacity-100 transition-opacity"
                >
                  <Minus size={8} />
                </button>
                <span
                  className={cn(
                    "text-xs font-mono font-medium",
                    damage > 0 ? "text-zinc-300" : "text-zinc-600"
                  )}
                >
                  {damage}
                </span>
                <button
                  onClick={() => handleCommanderDamageChange(opponentId, 1)}
                  className="text-zinc-600 hover:text-zinc-300 opacity-0 group-hover/cmd:opacity-100 transition-opacity"
                >
                  <Plus size={8} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
