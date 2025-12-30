import type { Card, Zone } from "@/types";

import { ZONE } from "@/constants/zones";

export type ZoneViewerMode = "grouped" | "linear";

export const getZoneViewerMode = (zone: Zone | null, count?: number): ZoneViewerMode => {
  if (zone?.type === ZONE.LIBRARY && !count) return "grouped";
  return "linear";
};

export const computeZoneViewerCards = (params: {
  zone: Zone;
  cardsById: Record<string, Card>;
  count?: number;
  frozenCardIds?: string[] | null;
  filterText: string;
}): Card[] => {
  let cardIds = [...params.zone.cardIds];

  // If count is specified, take from the END (top of library).
  if (params.count && params.count > 0) {
    if (params.zone.type === ZONE.LIBRARY && params.frozenCardIds != null) {
      const frozenSet = new Set(params.frozenCardIds);
      cardIds = cardIds.filter((id) => frozenSet.has(id));
    } else {
      cardIds = cardIds.slice(-params.count);
    }
  }

  let currentCards = cardIds.map((id) => params.cardsById[id]).filter(Boolean);

  if (params.filterText.trim()) {
    const lowerFilter = params.filterText.toLowerCase();
    currentCards = currentCards.filter((card) => {
      const nameMatch = card.name.toLowerCase().includes(lowerFilter);
      const faceNameMatch = card.scryfall?.card_faces?.some((face) =>
        face.name?.toLowerCase().includes(lowerFilter)
      );
      const typeMatch = card.typeLine?.toLowerCase().includes(lowerFilter);
      const oracleMatch = card.oracleText?.toLowerCase().includes(lowerFilter);
      return nameMatch || faceNameMatch || typeMatch || oracleMatch;
    });
  }

  return currentCards;
};

export const groupZoneViewerCards = (cards: Card[]): Record<string, Card[]> => {
  const groups: Record<string, Card[]> = {};

  cards.forEach((card) => {
    if (card.typeLine?.toLowerCase().includes("land")) {
      if (!groups["Lands"]) groups["Lands"] = [];
      groups["Lands"].push(card);
      return;
    }

    const cmc = card.scryfall?.cmc ?? 0;
    const key = `Cost ${cmc}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(card);
  });

  return groups;
};

export const sortZoneViewerGroupKeys = (keys: string[]): string[] => {
  return [...keys].sort((a, b) => {
    if (a === "Lands") return -1;
    if (b === "Lands") return 1;

    const costA = parseInt(a.replace("Cost ", ""));
    const costB = parseInt(b.replace("Cost ", ""));
    return costA - costB;
  });
};
