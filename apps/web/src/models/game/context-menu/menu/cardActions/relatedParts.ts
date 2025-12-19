import type { Card, ScryfallRelatedCard } from "@/types";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isRelatedCard = (value: unknown): value is ScryfallRelatedCard => {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.uri === "string" &&
    typeof value.component === "string" &&
    typeof value.object === "string"
  );
};

/**
 * Get related parts from a card. This requires full Scryfall data.
 * Returns empty array if only lite data is available.
 * TODO: Fetch full data on-demand using useScryfallCard hook
 */
export const getRelatedParts = (card: Card): ScryfallRelatedCard[] => {
  const raw = (card as Card & { scryfall?: unknown }).scryfall;
  if (!isRecord(raw)) return [];
  const parts = raw.all_parts;
  if (!Array.isArray(parts)) return [];
  return parts
    .filter(isRelatedCard)
    .filter((part) => part.component !== "combo_piece");
};

