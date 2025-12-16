import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../ui/dialog";
import { useGameStore } from "../../../store/gameStore";
import { CardView } from "../Card/Card";
import { canViewerSeeCardIdentity } from "../../../lib/reveal";
import { ZONE } from "../../../constants/zones";
import type { ZoneId } from "../../../types";
import { cn } from "../../../lib/utils";

interface OpponentLibraryRevealsModalProps {
  isOpen: boolean;
  onClose: () => void;
  zoneId: ZoneId | null;
}

export const OpponentLibraryRevealsModal: React.FC<
  OpponentLibraryRevealsModalProps
> = ({ isOpen, onClose, zoneId }) => {
  const myPlayerId = useGameStore((state) => state.myPlayerId);
  const players = useGameStore((state) => state.players);
  const zones = useGameStore((state) => state.zones);
  const cards = useGameStore((state) => state.cards);

  const zone = zoneId ? zones[zoneId] : null;
  const ownerName = zone ? players[zone.ownerId]?.name ?? zone.ownerId : "";

  const revealedCardIds = React.useMemo(() => {
    if (!zone || zone.type !== ZONE.LIBRARY) return [];
    if (zone.ownerId === myPlayerId) return [];

    // zone.cardIds is [bottom..top]; show top-first, preserving relative order.
    const visible = zone.cardIds.filter((id) => {
      const card = cards[id];
      if (!card) return false;
      return canViewerSeeCardIdentity(card, ZONE.LIBRARY, myPlayerId);
    });
    return visible.reverse();
  }, [zone, cards, myPlayerId]);

  const actualTopCardId = React.useMemo(() => {
    if (!zone || zone.type !== ZONE.LIBRARY) return null;
    return zone.cardIds.length ? zone.cardIds[zone.cardIds.length - 1] : null;
  }, [zone]);

  // If the reveal disappears while open, close (per UX request: only open when there's something).
  React.useEffect(() => {
    if (!isOpen) return;
    if (!zoneId) return;
    if (revealedCardIds.length === 0) onClose();
  }, [isOpen, zoneId, revealedCardIds.length, onClose]);

  if (!isOpen || !zone) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[90vw] h-[70vh] bg-zinc-950 border-zinc-800 text-zinc-100 flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-xl capitalize flex items-center gap-2">
            <span>Revealed cards in {ownerName}&apos;s library</span>
            <span className="text-zinc-500 text-sm font-normal">
              ({revealedCardIds.length})
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-x-auto overflow-y-hidden py-4">
          <div className="flex items-center gap-3 h-full">
            {revealedCardIds.map((id, index) => {
              const card = cards[id];
              if (!card) return null;
              const isActualTop = Boolean(actualTopCardId && id === actualTopCardId);
              return (
                <div key={id} className="relative shrink-0">
                  {index === 0 && (
                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-indigo-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap shadow-md z-10">
                      {isActualTop ? "Top" : "Topmost revealed"}
                    </div>
                  )}
                  <div className={cn("w-[150px] h-[210px] rounded-lg shadow-lg")}>
                    <CardView
                      card={card}
                      faceDown={false}
                      className="w-full h-full"
                      disableHoverAnimation
                    />
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
