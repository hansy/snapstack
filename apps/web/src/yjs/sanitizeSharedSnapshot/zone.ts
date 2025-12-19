import type { Zone } from "@/types";

import { MAX_CARDS_PER_ZONE } from "@/lib/limits";

export const sanitizeZone = (value: any): Zone | null => {
  if (!value || typeof value.id !== "string" || typeof value.ownerId !== "string") return null;
  const rawType = typeof value.type === "string" ? value.type : null;
  const type = rawType === "command" ? "commander" : rawType;
  if (!type) return null;
  if (!["library", "hand", "battlefield", "graveyard", "exile", "commander"].includes(type)) {
    return null;
  }
  const ids: string[] = Array.isArray(value.cardIds)
    ? Array.from(
        new Set<string>(
          (value.cardIds as unknown[]).filter(
            (cardId): cardId is string => typeof cardId === "string"
          )
        )
      ).slice(0, MAX_CARDS_PER_ZONE)
    : [];
  return {
    id: value.id,
    type,
    ownerId: value.ownerId,
    cardIds: ids,
  };
};

