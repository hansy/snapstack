import * as React from "react";

import type { Card } from "@/types";

import { useGameStore } from "@/store/gameStore";

export type CommanderZoneControllerInput = {
  zoneOwnerId: string;
};

export const useCommanderZoneController = ({ zoneOwnerId }: CommanderZoneControllerInput) => {
  const myPlayerId = useGameStore((state) => state.myPlayerId);
  const updateCard = useGameStore((state) => state.updateCard);

  const isOwner = myPlayerId === zoneOwnerId;

  const handleTaxDelta = React.useCallback(
    (card: Card, delta: number) => {
      if (!isOwner) return;
      const current = card.commanderTax ?? 0;
      const next = Math.max(0, Math.min(99, current + delta));
      updateCard(card.id, { commanderTax: next }, myPlayerId);
    },
    [isOwner, myPlayerId, updateCard]
  );

  return { isOwner, handleTaxDelta };
};

export type CommanderZoneController = ReturnType<typeof useCommanderZoneController>;
