import * as React from "react";

import type { ZoneId } from "@/types";

import { useGameStore } from "@/store/gameStore";

import {
  computeRevealedOpponentLibraryCards,
  resolveZoneOwnerName,
} from "@/models/game/opponent-library-reveals/opponentLibraryRevealsModel";

export type OpponentLibraryRevealsControllerInput = {
  isOpen: boolean;
  onClose: () => void;
  zoneId: ZoneId | null;
};

export const useOpponentLibraryRevealsController = ({
  isOpen,
  onClose,
  zoneId,
}: OpponentLibraryRevealsControllerInput) => {
  const myPlayerId = useGameStore((state) => state.myPlayerId);
  const players = useGameStore((state) => state.players);
  const zones = useGameStore((state) => state.zones);
  const cards = useGameStore((state) => state.cards);
  const libraryRevealsToAll = useGameStore((state) => state.libraryRevealsToAll);

  const zone = zoneId ? zones[zoneId] : null;
  const ownerName = resolveZoneOwnerName({ zone, players });
  const libraryTopReveal = zone ? players[zone.ownerId]?.libraryTopReveal : undefined;

  const { cards: revealedCards, actualTopCardId } = React.useMemo(
    () =>
      computeRevealedOpponentLibraryCards({
        zone,
        cardsById: cards,
        viewerId: myPlayerId,
        libraryRevealsToAll,
        libraryTopReveal,
      }),
    [zone, cards, myPlayerId, libraryRevealsToAll, libraryTopReveal]
  );

  // If the reveal disappears while open, close (per UX request: only open when there's something).
  React.useEffect(() => {
    if (!isOpen) return;
    if (!zoneId) return;
    if (revealedCards.length === 0) onClose();
  }, [isOpen, zoneId, revealedCards.length, onClose]);

  if (!isOpen || !zone) return null;

  return {
    isOpen,
    onClose,
    ownerName,
    revealedCards,
    actualTopCardId,
  };
};

export type OpponentLibraryRevealsController = NonNullable<
  ReturnType<typeof useOpponentLibraryRevealsController>
>;
