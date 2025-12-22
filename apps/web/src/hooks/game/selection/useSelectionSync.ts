import React from "react";

import { ZONE } from "@/constants/zones";
import { useGameStore } from "@/store/gameStore";
import { useSelectionStore } from "@/store/selectionStore";

import type { PlayerId } from "@/types";

export const useSelectionSync = (myPlayerId: PlayerId) => {
  const selectedCardIds = useSelectionStore((state) => state.selectedCardIds);
  const selectionZoneId = useSelectionStore((state) => state.selectionZoneId);
  const setSelection = useSelectionStore((state) => state.setSelection);
  const clearSelection = useSelectionStore((state) => state.clearSelection);
  const cards = useGameStore((state) => state.cards);
  const zones = useGameStore((state) => state.zones);

  React.useEffect(() => {
    if (!selectionZoneId || selectedCardIds.length === 0) {
      if (selectionZoneId !== null || selectedCardIds.length !== 0) {
        clearSelection();
      }
      return;
    }

    const zone = zones[selectionZoneId];
    if (!zone || zone.type !== ZONE.BATTLEFIELD || zone.ownerId !== myPlayerId) {
      clearSelection();
      return;
    }

    const nextIds = selectedCardIds.filter(
      (id) => cards[id]?.zoneId === selectionZoneId
    );

    if (nextIds.length === 0) {
      clearSelection();
      return;
    }

    if (nextIds.length !== selectedCardIds.length) {
      setSelection(nextIds, selectionZoneId);
    }
  }, [
    cards,
    clearSelection,
    myPlayerId,
    selectedCardIds,
    selectionZoneId,
    setSelection,
    zones,
  ]);
};
