import * as React from "react";

import type { Card, ZoneId } from "@/types";

import { useGameStore } from "@/store/gameStore";

import {
  computeRevealedOpponentLibraryCardIds,
  getLibraryTopCardId,
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

  const zone = zoneId ? zones[zoneId] : null;
  const ownerName = resolveZoneOwnerName({ zone, players });

  const revealedCardIds = React.useMemo(
    () => computeRevealedOpponentLibraryCardIds({ zone, cardsById: cards, viewerId: myPlayerId }),
    [zone, cards, myPlayerId]
  );

  const revealedCards = React.useMemo(
    () =>
      revealedCardIds
        .map((id) => cards[id])
        .filter((card): card is Card => Boolean(card)),
    [cards, revealedCardIds]
  );

  const actualTopCardId = React.useMemo(() => getLibraryTopCardId(zone), [zone]);

  // If the reveal disappears while open, close (per UX request: only open when there's something).
  React.useEffect(() => {
    if (!isOpen) return;
    if (!zoneId) return;
    if (revealedCardIds.length === 0) onClose();
  }, [isOpen, zoneId, revealedCardIds.length, onClose]);

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

