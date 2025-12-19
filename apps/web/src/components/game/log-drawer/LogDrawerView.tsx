import React from "react";
import { X } from "lucide-react";

import type { LogMessage, LogMessagePart } from "@/logging/types";
import { getCardDisplayName } from "@/logging/helpers";
import type { Card, Player, Zone } from "@/types";

import { cn } from "@/lib/utils";

import type { LogDrawerController } from "@/hooks/game/log-drawer/useLogDrawerController";
import { computeVisibleCardName, formatTimeAgo, getBorderColorClass } from "@/models/game/log-drawer/logDrawerModel";

export const LogDrawerView: React.FC<LogDrawerController> = ({
  isOpen,
  handleClose,
  playerColors,
  entries,
  selfPlayerId,
  logContext,
  scrollRef,
}) => {
  return (
    <>
      <div
        className={cn(
          "fixed inset-0 bg-black/10 z-40 transition-opacity duration-300",
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={handleClose}
      />

      <div
        className={cn(
          "fixed left-12 top-0 bottom-0 w-80 bg-zinc-950/70 border-r border-zinc-800 z-50 transition-transform duration-300 ease-in-out flex flex-col shadow-2xl backdrop-blur-md",
          isOpen ? "translate-x-0 pointer-events-auto" : "-translate-x-full pointer-events-none"
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
          className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent"
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
      </div>
    </>
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

  return (
    <div
      className={cn(
        "text-sm bg-zinc-900/40 rounded p-2 border-l-2",
        getBorderColorClass(actorColor)
      )}
    >
      <div className="flex flex-wrap gap-1 items-baseline leading-relaxed text-zinc-300">
        {entry.parts.map((part, idx) => (
          <LogPartRenderer
            key={idx}
            part={part}
            entry={entry}
            selfPlayerId={selfPlayerId}
            logContext={logContext}
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
  entry: LogMessage;
  selfPlayerId?: string;
  logContext: {
    players: Record<string, Player>;
    cards: Record<string, Card>;
    zones: Record<string, Zone>;
  };
}> = ({ part, selfPlayerId, entry, logContext }) => {
  switch (part.kind) {
    case "player": {
      if (part.playerId && part.playerId === selfPlayerId) {
        const selfName = selfPlayerId ? logContext.players[selfPlayerId]?.name : undefined;
        return <span className="font-semibold text-zinc-100">{selfName || part.text}</span>;
      }
      return <span className="font-semibold text-zinc-100">{part.text}</span>;
    }

    case "card": {
      if (part.cardId) {
        const payload = entry.payload as any;
        const fromZone = payload?.fromZoneId
          ? logContext.zones[payload.fromZoneId]
          : payload?.zoneId
            ? logContext.zones[payload.zoneId]
            : undefined;
        const toZone = payload?.toZoneId
          ? logContext.zones[payload.toZoneId]
          : payload?.zoneId
            ? logContext.zones[payload.zoneId]
            : undefined;

        const computed = getCardDisplayName(
          logContext,
          part.cardId,
          fromZone,
          toZone,
          payload?.cardName
        );

        const visibleName = computeVisibleCardName({
          computedName: computed,
          fallbackName: payload?.cardName,
          fromZoneType: fromZone?.type ?? payload?.fromZoneType,
          toZoneType: toZone?.type ?? payload?.toZoneType,
        });

        return <span className="text-indigo-300">{visibleName || part.text}</span>;
      }

      const payload = entry.payload as any;
      if (payload?.cardName) {
        return <span className="text-indigo-300">{payload.cardName}</span>;
      }

      return <span className="text-indigo-300">{part.text}</span>;
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

