import { MAX_CARDS_PER_ZONE } from "@/lib/limits";
import { getRequestedCounts } from "./counts";
import type { ParsedCard } from "./types";

export const validateDeckListLimits = (
  parsedDeck: ParsedCard[],
  opts?: { maxLibraryCards?: number }
): { ok: true } | { ok: false; error: string } => {
  const { library } = getRequestedCounts(parsedDeck);
  const maxLibraryCards = opts?.maxLibraryCards ?? MAX_CARDS_PER_ZONE;

  if (library > maxLibraryCards) {
    return {
      ok: false,
      error: `Deck too large: ${library} cards would be added to your library, but the current limit is ${maxLibraryCards}.`,
    };
  }

  return { ok: true };
};

