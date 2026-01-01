import type { ParsedCard } from "./types";

export const getRequestedCounts = (parsedDeck: ParsedCard[]) => {
  const counts = {
    total: 0,
    commander: 0,
    library: 0,
    sideboard: 0,
  };

  parsedDeck.forEach((card) => {
    const qty = typeof card.quantity === "number" ? Math.max(0, card.quantity) : 0;
    counts.total += qty;
    if (card.section === "commander") counts.commander += qty;
    else if (card.section === "sideboard") counts.sideboard += qty;
    else counts.library += qty;
  });

  return counts;
};

