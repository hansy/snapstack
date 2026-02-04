import React from "react";

import type { Card } from "@/types";

import { cn } from "@/lib/utils";
import { CardView } from "../card/Card";

export interface ZoneViewerGroupedViewProps {
  sortedKeys: string[];
  groupedCards: Record<string, Card[]>;
  cardWidthPx: number;
  cardHeightPx: number;
  interactionsDisabled: boolean;
  pinnedCardId?: string;
  onCardContextMenu: (e: React.MouseEvent, card: Card) => void;
}

export const ZoneViewerGroupedView: React.FC<ZoneViewerGroupedViewProps> = ({
  sortedKeys,
  groupedCards,
  cardWidthPx,
  cardHeightPx,
  interactionsDisabled,
  pinnedCardId,
  onCardContextMenu,
}) => {
  const stackOffsetPx = Math.max(24, Math.round(cardHeightPx * 0.2));
  const overlapPx = cardHeightPx - stackOffsetPx;
  const columnWidthPx = Math.round(cardWidthPx + 24);
  const paddingBottomPx = Math.round(cardHeightPx);
  return (
    <div className="flex gap-8 h-full">
      {sortedKeys.map((key) => {
        const cardsInGroup = groupedCards[key] ?? [];

        return (
          <div key={key} className="shrink-0 flex flex-col" style={{ width: columnWidthPx }}>
            <h3 className="text-sm font-medium text-zinc-400 border-b border-zinc-800/50 pb-2 mb-4 text-center sticky top-0 bg-zinc-950/50 backdrop-blur-sm z-10">
              {key} ({cardsInGroup.length})
            </h3>
            <div
              className="relative flex-1 overflow-y-auto overflow-x-hidden flex flex-col"
              style={{
                pointerEvents: interactionsDisabled ? "none" : "auto",
                paddingBottom: paddingBottomPx,
              }}
            >
              {cardsInGroup.map((card, index) => {
                const isPinned = pinnedCardId === card.id;
                return (
                  <div
                    key={card.id}
                    className={cn(
                      "mx-auto transition-all duration-200",
                      !interactionsDisabled && "hover:z-[100] hover:scale-110 hover:!mb-4",
                      isPinned && "scale-110 shadow-xl"
                    )}
                    style={{
                      width: `${cardWidthPx}px`,
                      height: `${cardHeightPx}px`,
                      marginBottom: isPinned
                        ? `${Math.round(cardHeightPx * 0.06)}px`
                        : `-${overlapPx}px`,
                      zIndex: isPinned ? 200 : index,
                    }}
                  >
                    <CardView
                      card={card}
                      faceDown={false}
                      className="w-full shadow-lg h-full"
                      imageClassName="object-top"
                      preferArtCrop={false}
                      onContextMenu={(e) => onCardContextMenu(e, card)}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};
