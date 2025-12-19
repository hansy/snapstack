import type { ParsedCard } from "./types";

export const formatMissingCards = (missing: ParsedCard[]): string => {
  return missing
    .map(
      (card) =>
        `${card.quantity}x ${card.name}${
          card.set ? ` (${card.set.toUpperCase()} ${card.collectorNumber})` : ""
        }`
    )
    .join(", ");
};

