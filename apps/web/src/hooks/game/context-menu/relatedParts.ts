import type { Card, ZoneType } from "@/types";
import type { ScryfallCard, ScryfallRelatedCard } from "@/types/scryfall";

import { ZONE } from "@/constants/zones";

export const getNonComboRelatedParts = (
  parts: ScryfallRelatedCard[] | undefined
): ScryfallRelatedCard[] => {
  return (parts ?? []).filter((part) => part.component !== "combo_piece");
};

export const fetchBattlefieldRelatedParts = async (params: {
  card: Pick<Card, "scryfallId">;
  zoneType: ZoneType | undefined;
  fetchCardById: (scryfallId: string) => Promise<ScryfallCard | null | undefined>;
}): Promise<ScryfallRelatedCard[] | undefined> => {
  if (!params.card.scryfallId) return undefined;
  if (params.zoneType !== ZONE.BATTLEFIELD) return undefined;

  try {
    const fullCard = await params.fetchCardById(params.card.scryfallId);
    return fullCard?.all_parts ? getNonComboRelatedParts(fullCard.all_parts) : undefined;
  } catch {
    return undefined;
  }
};
