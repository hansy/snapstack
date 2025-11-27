import React from "react";
import { Card as CardType, Zone as ZoneType, ZoneId } from "../../../types";
import { Zone } from "../Zone/Zone";
import { Card } from "../Card/Card";
import { cn } from "../../../lib/utils";
import { ZONE_SIDEWAYS_CLASSES } from "../../../lib/constants";

interface SideZoneProps {
  zone: ZoneType;
  card?: CardType;
  label: string;
  count: number;
  onContextMenu?: (e: React.MouseEvent, zoneId: ZoneId) => void;
  emptyContent?: React.ReactNode;
  cardClassName?: string;
  faceDown?: boolean;
}

// Shared rendering for vertical sidebar zones (library/graveyard/exile).
export const SideZone: React.FC<SideZoneProps> = ({
  zone,
  card,
  label,
  count,
  onContextMenu,
  emptyContent,
  cardClassName,
  faceDown,
}) => {
  return (
    <div
      className="relative group"
      onContextMenu={(e) => onContextMenu?.(e, zone.id)}
    >
      <Zone
        zone={zone}
        className={cn(
          ZONE_SIDEWAYS_CLASSES,
          "bg-zinc-800/30 rounded-lg border-2 border-dashed border-zinc-700 flex items-center justify-center relative",
          onContextMenu && "cursor-context-menu"
        )}
      >
        {card ? (
          <div className="w-full h-full relative overflow-hidden rounded-lg">
            <Card
              card={card}
              faceDown={faceDown}
              className={cn(
                "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rotate-90 scale-90 pointer-events-none origin-center",
                cardClassName
              )}
            />
          </div>
        ) : (
          (emptyContent ?? <span className="text-zinc-600 text-md">Empty</span>)
        )}

        <div className="absolute left-1/2 -translate-x-1/2 bg-zinc-900 px-2 text-md text-zinc-400 uppercase tracking-wider font-semibold whitespace-nowrap border border-zinc-800 rounded-full z-10 -top-3">
          {label}
        </div>
        <div className="absolute left-1/2 -translate-x-1/2 bg-zinc-900 px-2 text-md text-zinc-300 font-mono border border-zinc-800 rounded-full z-10 -bottom-3">
          {count}
        </div>
      </Zone>
    </div>
  );
};
