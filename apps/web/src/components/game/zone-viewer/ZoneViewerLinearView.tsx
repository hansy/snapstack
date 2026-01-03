import React from "react";

import type { Card } from "@/types";

import { cn } from "@/lib/utils";
import { CardView } from "../card/Card";

export interface ZoneViewerLinearViewProps {
  orderedCards: Card[];
  canReorder: boolean;
  orderedCardIds: string[];
  setOrderedCardIds: React.Dispatch<React.SetStateAction<string[]>>;
  draggingId: string | null;
  setDraggingId: (id: string | null) => void;
  reorderList: (ids: string[], draggingId: string, overId: string) => string[];
  commitReorder: (newOrder: string[]) => void;
  displayCards: Card[];
  interactionsDisabled: boolean;
  pinnedCardId?: string;
  onCardContextMenu: (e: React.MouseEvent, card: Card) => void;
  listRef: React.RefObject<HTMLDivElement | null>;
}

export const ZoneViewerLinearView: React.FC<ZoneViewerLinearViewProps> = ({
  orderedCards,
  canReorder,
  orderedCardIds,
  setOrderedCardIds,
  draggingId,
  setDraggingId,
  reorderList,
  commitReorder,
  displayCards,
  interactionsDisabled,
  pinnedCardId,
  onCardContextMenu,
  listRef,
}) => {
  const renderCards = React.useMemo(() => [...orderedCards].reverse(), [orderedCards]);
  const [hoveredId, setHoveredId] = React.useState<string | null>(null);
  const hoveredIndex = React.useMemo(() => {
    if (!hoveredId) return -1;
    return renderCards.findIndex((card) => card.id === hoveredId);
  }, [hoveredId, renderCards]);

  return (
    <div
      ref={listRef}
      className="flex h-full items-center overflow-x-auto px-24 pb-4"
      style={{ pointerEvents: interactionsDisabled ? "none" : "auto" }}
    >
      {renderCards.map((card, index) => {
        const isPinned = pinnedCardId === card.id;
        const isDragging = draggingId === card.id;
        const isHovered = hoveredId === card.id;
        const distance = hoveredIndex < 0 ? -1 : Math.abs(index - hoveredIndex);
        const offset = (() => {
          if (hoveredIndex < 0) return 0;
          if (distance === 0) return 0;
          const MAX_SPREAD = 92;
          const DECAY = 12;
          const direction = index < hoveredIndex ? -1 : 1;
          const magnitude = Math.max(0, MAX_SPREAD - (distance - 1) * DECAY);
          return direction * magnitude;
        })();
        const scale = isPinned ? 1.1 : isHovered ? 1.08 : 1;
        const zIndex = (() => {
          if (isPinned) return 300;
          if (isHovered) return 200;
          if (hoveredIndex < 0) return renderCards.length - index;
          return 150 - distance;
        })();
        return (
          <div
            key={card.id}
            draggable={canReorder}
            onDragStart={() => canReorder && setDraggingId(card.id)}
            onDragEnter={(e) => {
              if (!canReorder || !draggingId) return;
              e.preventDefault();
              setOrderedCardIds((ids) => {
                const source = ids.length ? ids : displayCards.map((c) => c.id);
                const rendered = [...source].reverse();
                const reordered = reorderList(rendered, draggingId, card.id);
                return reordered.reverse();
              });
            }}
            onDragOver={canReorder ? (e) => e.preventDefault() : undefined}
            onDragEnd={() => {
              if (!canReorder || !draggingId) return;
              commitReorder(orderedCardIds.length ? orderedCardIds : displayCards.map((c) => c.id));
              setDraggingId(null);
            }}
            onDrop={(e) => {
              if (!canReorder) return;
              e.preventDefault();
            }}
            onMouseEnter={() => setHoveredId(card.id)}
            onMouseLeave={() =>
              setHoveredId((prev) => (prev === card.id ? null : prev))
            }
            className={cn(
              "shrink-0 w-[50px] h-full transition-transform duration-200 ease-out relative group flex items-center justify-center"
            )}
            style={{
              transform: `translateX(${offset}px) scale(${scale})`,
              zIndex,
              opacity: isDragging ? 0.5 : 1,
            }}
          >
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 mt-4 h-[calc(100%-2rem)] max-h-[280px] w-auto aspect-[2.5/3.5]">
              {index === 0 && (
                <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-indigo-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap shadow-md z-[101]">
                  Top card
                </div>
              )}
              <CardView
                card={card}
                faceDown={false}
                className="w-full h-full shadow-lg"
                imageClassName="object-top"
                preferArtCrop={false}
                disableHoverAnimation
                onContextMenu={(e) => onCardContextMenu(e, card)}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};
