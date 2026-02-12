import React from "react";
import { X } from "lucide-react";

import type { LogMessage, LogMessagePart } from "@/logging/types";
import type { Card, Player, Zone } from "@/types";

import { cn } from "@/lib/utils";

import type { LogDrawerController } from "@/hooks/game/log-drawer/useLogDrawerController";
import {
  formatTimeAgo,
  getBorderColorClass,
  resolveLogCardContext,
  resolveLogCardDisplayName,
} from "@/models/game/log-drawer/logDrawerModel";

type LogDrawerLayout = "sidebar" | "stacked";

type LogDrawerViewProps = LogDrawerController & {
  layout?: LogDrawerLayout;
};

export const LogDrawerView: React.FC<LogDrawerViewProps> = ({
  isOpen,
  handleClose,
  playerColors,
  entries,
  selfPlayerId,
  logContext,
  scrollRef,
  layout = "sidebar",
}) => {
  const isStacked = layout === "stacked";

  return (
    <aside
      className={cn(
        "bg-zinc-950/70 transition-[width,height,opacity,transform,border-color] duration-300 ease-in-out flex flex-col shadow-2xl backdrop-blur-md overflow-hidden shrink-0",
        isStacked
          ? isOpen
            ? "w-full h-[min(40dvh,22rem)] opacity-100 translate-y-0 pointer-events-auto border-t border-zinc-800"
            : "w-full h-0 opacity-0 translate-y-2 pointer-events-none border-t border-transparent"
          : isOpen
            ? "h-full w-50 lg:w-[var(--log-w)] opacity-100 translate-x-0 pointer-events-auto border-l border-zinc-800"
            : "h-full w-0 opacity-0 translate-x-2 pointer-events-none border-l border-transparent"
      )}
    >
      <div className="flex items-center justify-between p-4 border-b border-zinc-800/50 bg-zinc-900/50">
        <h2 className="font-bold text-zinc-100 uppercase tracking-wider text-sm">Game Log</h2>
        <button
          onClick={handleClose}
          className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-zinc-100 transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-2 py-3 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent"
      >
        {entries.length === 0 ? (
          <div className="text-zinc-500 text-xs text-center italic py-4">No events yet</div>
        ) : (
          entries.map((entry) => (
            <LogEntryItem
              key={entry.id}
              entry={entry}
              playerColors={playerColors}
              selfPlayerId={selfPlayerId}
              logContext={logContext}
            />
          ))
        )}
      </div>
    </aside>
  );
};

const LogEntryItem: React.FC<{
  entry: LogMessage;
  playerColors: Record<string, string>;
  selfPlayerId?: string;
  logContext: {
    players: Record<string, Player>;
    cards: Record<string, Card>;
    zones: Record<string, Zone>;
  };
}> = ({ entry, playerColors, selfPlayerId, logContext }) => {
  const actorColor = entry.actorId ? playerColors[entry.actorId] : undefined;
  const cardContext = resolveLogCardContext(entry, logContext);

  return (
    <div
      className={cn("text-xs px-3 py-2 border-l-2", getBorderColorClass(actorColor))}
    >
      <div className="flex flex-wrap gap-1 items-baseline leading-snug text-zinc-300">
        {entry.parts.map((part, idx) => (
          <LogPartRenderer
            key={idx}
            part={part}
            selfPlayerId={selfPlayerId}
            logContext={logContext}
            cardContext={cardContext}
          />
        ))}
      </div>
      <div className="mt-1 text-[10px] text-zinc-600 text-right">
        {formatTimeAgo(entry.ts)}
      </div>
    </div>
  );
};

const LogPartRenderer: React.FC<{
  part: LogMessagePart;
  selfPlayerId?: string;
  logContext: {
    players: Record<string, Player>;
    cards: Record<string, Card>;
    zones: Record<string, Zone>;
  };
  cardContext: ReturnType<typeof resolveLogCardContext>;
}> = ({ part, selfPlayerId, logContext, cardContext }) => {
  switch (part.kind) {
    case "player": {
      if (part.playerId && part.playerId === selfPlayerId) {
        const selfName = selfPlayerId ? logContext.players[selfPlayerId]?.name : undefined;
        return <span className="font-semibold text-zinc-100">{selfName || part.text}</span>;
      }
      return <span className="font-semibold text-zinc-100">{part.text}</span>;
    }

    case "card": {
      const name = resolveLogCardDisplayName({ part, logContext, cardContext });
      return <span className="text-indigo-300">{name}</span>;
    }

    case "zone":
      return <span className="italic text-zinc-400">{part.text}</span>;
    case "value":
      return <span className="font-mono text-emerald-400">{part.text}</span>;
    case "text":
    default:
      return <span>{part.text}</span>;
  }
};
