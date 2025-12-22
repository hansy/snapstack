import type { Card, CardId } from "@/types";

export type SelectionSnapshot = {
  selectedCardIds: CardId[];
  selectionZoneId: string | null;
};

export const resolveSelectedCardIds = (params: {
  seedCardId: CardId;
  cardsById: Record<CardId, Card>;
  selection: SelectionSnapshot;
  minCount?: number;
  fallbackToSeed?: boolean;
}): CardId[] => {
  const {
    seedCardId,
    cardsById,
    selection,
    minCount = 1,
    fallbackToSeed = true,
  } = params;

  const seedCard = cardsById[seedCardId];
  if (!seedCard) return [];

  const selectionMatches =
    selection.selectionZoneId === seedCard.zoneId &&
    selection.selectedCardIds.includes(seedCardId);

  const baseIds = selectionMatches ? selection.selectedCardIds : [];
  const filtered = Array.from(
    new Set(
      baseIds.filter((id) => cardsById[id]?.zoneId === seedCard.zoneId)
    )
  );

  if (filtered.length >= minCount) return filtered;
  return fallbackToSeed ? [seedCardId] : [];
};
