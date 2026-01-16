import React from "react";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../ui/dialog";
import { Card } from "../card/Card";
import { cn } from "@/lib/utils";

import type { OpponentLibraryRevealsController } from "@/hooks/game/opponent-library-reveals/useOpponentLibraryRevealsController";

export const OpponentLibraryRevealsModalView: React.FC<OpponentLibraryRevealsController> = ({
  isOpen,
  onClose,
  ownerName,
  revealedCards,
  actualTopCardId,
}) => {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[90vw] h-[70vh] bg-zinc-950 border-zinc-800 text-zinc-100 flex flex-col">
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
                  <div className={cn("w-[150px] h-[210px] rounded-lg shadow-lg")}>
                    <Card card={card} faceDown={false} className="w-full h-full" disableDrag />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
