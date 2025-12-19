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
}) => {
  return (
    <div
      className="flex h-full items-center overflow-x-auto px-4 pb-4 pr-[220px]"
      style={{ pointerEvents: interactionsDisabled ? "none" : "auto" }}
    >
      {orderedCards.map((card, index) => {
        const isPinned = pinnedCardId === card.id;
        const isDragging = draggingId === card.id;
        return (
          <div
            key={card.id}
            draggable={canReorder}
            onDragStart={() => canReorder && setDraggingId(card.id)}
            onDragEnter={(e) => {
              if (!canReorder || !draggingId) return;
              e.preventDefault();
              setOrderedCardIds((ids) => reorderList(ids, draggingId, card.id));
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
            className={cn(
              "shrink-0 w-[50px] h-full transition-all duration-200 relative group flex items-center justify-center",
              !interactionsDisabled && "hover:scale-110 hover:z-[100] hover:w-[200px]",
              isPinned && "scale-110 w-[200px]"
            )}
            style={{
              zIndex: isPinned ? 200 : index,
              opacity: isDragging ? 0.5 : 1,
            }}
          >
            <div className="absolute left-0 top-1/2 -translate-y-1/2 mt-4 h-[calc(100%-2rem)] max-h-[280px] w-auto aspect-[2.5/3.5]">
              {index === orderedCards.length - 1 && (
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
                onContextMenu={(e) => onCardContextMenu(e, card)}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};
