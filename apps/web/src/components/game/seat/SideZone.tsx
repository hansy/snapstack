import React from "react";
import { Card as CardType, Zone as ZoneType, ZoneId } from "@/types";
import { Zone } from "../zone/Zone";
import { Card } from "../card/Card";
import { cn } from "@/lib/utils";
import { ZONE_SIDEWAYS_CLASSES } from "@/lib/constants";

interface SideZoneProps {
  zone: ZoneType;
  card?: CardType;
  label: string;
  count: number;
  onContextMenu?: (e: React.MouseEvent, zoneId: ZoneId) => void;
  onClick?: (e: React.MouseEvent, zoneId: ZoneId) => void;
  onDoubleClick?: (e: React.MouseEvent, zoneId: ZoneId) => void;
  emptyContent?: React.ReactNode;
  cardClassName?: string;
  faceDown?: boolean;
  disableCardDrag?: boolean;
  showContextMenuCursor?: boolean;
  rightIndicator?: React.ReactNode;
  indicatorSide?: "left" | "right";
}

// Shared rendering for vertical sidebar zones (library/graveyard/exile).
export const SideZone: React.FC<SideZoneProps> = ({
  zone,
  card,
  label,
  count,
  onContextMenu,
  onClick,
  onDoubleClick,
  emptyContent,
  cardClassName,
  faceDown,
  disableCardDrag,
  showContextMenuCursor,
  rightIndicator,
  indicatorSide = "right",
}) => {
  return (
    <div
      className="relative group w-full"
      onContextMenu={(e) => onContextMenu?.(e, zone.id)}
      onClick={(e) => onClick?.(e, zone.id)}
      onDoubleClick={(e) => onDoubleClick?.(e, zone.id)}
    >
      <Zone
        zone={zone}
        className={cn(
          ZONE_SIDEWAYS_CLASSES,
          "bg-zinc-800/30 rounded-lg border-2 border-dotted border-zinc-700 flex items-center justify-center relative transition-colors duration-150 p-[var(--sidezone-pad)]",
          "hover:bg-zinc-800/50 hover:border-zinc-500/80 hover:shadow-[0_0_0_1px_rgba(148,163,184,0.3)]",
          showContextMenuCursor
            ? "cursor-context-menu"
            : onClick && "cursor-pointer",
        )}
      >
        {rightIndicator && (
          <div
            className={cn(
              "absolute top-1/2 -translate-y-1/2 pointer-events-none z-[10] drop-shadow-[0_10px_20px_rgba(0,0,0,0.6)]",
              // Keep the indicator "inland" by placing it inside the zone bounds.
              indicatorSide === "left" ? "left-[-20px]" : "right-[-20px]",
            )}
          >
            {rightIndicator}
          </div>
        )}
        {card ? (
          <div className="w-full h-full relative overflow-hidden rounded-lg">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-full aspect-[2/3] rotate-90 scale-[var(--sidezone-card-scale)] origin-center">
                <Card
                  card={card}
                  style={{ width: "100%", height: "100%" }}
                  faceDown={faceDown}
                  disableDrag={disableCardDrag}
                  disableHoverAnimation
                  className={cn("w-full h-full", cardClassName)}
                />
              </div>
            </div>
          </div>
        ) : (
          (emptyContent ?? <span className="text-zinc-600 text-xs">Empty</span>)
        )}

        <div className="absolute left-1/2 -translate-x-1/2 bg-zinc-900 px-2 text-xs text-zinc-400 uppercase tracking-wider font-semibold whitespace-nowrap border border-zinc-800 rounded-full z-10 -top-3">
          {label}
        </div>
        <div className="absolute left-1/2 -translate-x-1/2 bg-zinc-900 px-2 lg:text-xs text-zinc-300 font-mono border border-zinc-800 rounded-full z-10 -bottom-3">
          {count}
        </div>
      </Zone>
    </div>
  );
};
