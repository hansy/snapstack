import React from "react";

import type { Card } from "@/types";

import { cn } from "@/lib/utils";
import { CardView } from "../card/Card";

export interface ZoneViewerGroupedViewProps {
  sortedKeys: string[];
  groupedCards: Record<string, Card[]>;
  interactionsDisabled: boolean;
  pinnedCardId?: string;
  onCardContextMenu: (e: React.MouseEvent, card: Card) => void;
}

export const ZoneViewerGroupedView: React.FC<ZoneViewerGroupedViewProps> = ({
  sortedKeys,
  groupedCards,
  interactionsDisabled,
  pinnedCardId,
  onCardContextMenu,
}) => {
  return (
    <div className="flex gap-8 h-full">
      {sortedKeys.map((key) => {
        const cardsInGroup = groupedCards[key] ?? [];
        const STACK_OFFSET = 50;
        const CARD_HEIGHT = 252; // Based on w-[180px] and aspect ratio
        const OVERLAP = CARD_HEIGHT - STACK_OFFSET; // 202px

        return (
          <div key={key} className="shrink-0 w-[200px] flex flex-col">
            <h3 className="text-sm font-medium text-zinc-400 border-b border-zinc-800/50 pb-2 mb-4 text-center sticky top-0 bg-zinc-950/50 backdrop-blur-sm z-10">
              {key} ({cardsInGroup.length})
            </h3>
            <div
              className="relative flex-1 overflow-y-auto overflow-x-hidden flex flex-col pb-[250px]"
              style={{ pointerEvents: interactionsDisabled ? "none" : "auto" }}
            >
              {cardsInGroup.map((card, index) => {
                const isPinned = pinnedCardId === card.id;
                return (
                  <div
                    key={card.id}
                    className={cn(
                      "w-[180px] mx-auto transition-all duration-200",
                      !interactionsDisabled && "hover:z-[100] hover:scale-110 hover:!mb-4",
                      isPinned && "scale-110 shadow-xl"
                    )}
                    style={{
                      height: `${CARD_HEIGHT}px`,
                      marginBottom: isPinned ? "16px" : `-${OVERLAP}px`,
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
