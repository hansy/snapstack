import React from "react";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../ui/dialog";
import { CardView } from "../card/Card";
import { cn } from "@/lib/utils";
import { getPreviewDimensions, useIsLg } from "@/hooks/game/seat/useSeatSizing";
import { useGameStore } from "@/store/gameStore";

import type { OpponentLibraryRevealsController } from "@/hooks/game/opponent-library-reveals/useOpponentLibraryRevealsController";

export const OpponentLibraryRevealsModalView: React.FC<OpponentLibraryRevealsController> = ({
  isOpen,
  onClose,
  ownerName,
  revealedCards,
  actualTopCardId,
}) => {
  const ownerId = revealedCards[0]?.ownerId;
  const baseCardWidthPx = useGameStore((state) =>
    ownerId ? state.battlefieldGridSizing[ownerId]?.baseCardWidthPx : undefined
  );
  const isLg = useIsLg();
  const isPreviewReady = !isLg || Boolean(baseCardWidthPx);
  const { previewWidthPx, previewHeightPx } = React.useMemo(
    () => getPreviewDimensions(baseCardWidthPx),
    [baseCardWidthPx]
  );

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[94vw] max-w-[94vw] h-[94vh] max-h-[94vh] bg-zinc-950 border-zinc-800 text-zinc-100 flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-xl capitalize flex items-center gap-2">
            <span>Revealed cards in {ownerName}&apos;s library</span>
            <span className="text-zinc-500 text-sm font-normal">({revealedCards.length})</span>
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            Cards are shown top-first based on the opponent&apos;s library order.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-x-auto overflow-y-hidden py-4">
          {!isPreviewReady ? (
            <div className="h-full flex items-center justify-center text-zinc-500">
              Preparing card previews...
            </div>
          ) : (
            <div className="flex items-center gap-3 h-full">
              {revealedCards.map((card, index) => {
                const isActualTop = Boolean(actualTopCardId && card.id === actualTopCardId);
                return (
                  <div key={card.id} className="relative shrink-0">
                    {index === 0 && (
                      <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-indigo-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap shadow-md z-10">
                        {isActualTop ? "Top" : "Topmost revealed"}
                      </div>
                    )}
                    <div
                      className={cn("rounded-lg shadow-lg")}
                      style={{ width: previewWidthPx, height: previewHeightPx }}
                    >
                      <CardView
                        card={card}
                        faceDown={false}
                        style={{ width: previewWidthPx, height: previewHeightPx }}
                        className="w-full h-full"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
