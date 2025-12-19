import * as React from "react";

import { useGameStore } from "@/store/gameStore";

export type CommanderZoneControllerInput = {
  zoneOwnerId: string;
};

export const useCommanderZoneController = ({ zoneOwnerId }: CommanderZoneControllerInput) => {
  const myPlayerId = useGameStore((state) => state.myPlayerId);
  const commanderTax = useGameStore((state) => state.players[zoneOwnerId]?.commanderTax || 0);
  const updateCommanderTax = useGameStore((state) => state.updateCommanderTax);

  const isOwner = myPlayerId === zoneOwnerId;

  const handleTaxDelta = React.useCallback(
    (delta: number) => {
      updateCommanderTax(zoneOwnerId, delta);
    },
    [updateCommanderTax, zoneOwnerId]
  );

  return { commanderTax, isOwner, handleTaxDelta };
};

export type CommanderZoneController = ReturnType<typeof useCommanderZoneController>;

