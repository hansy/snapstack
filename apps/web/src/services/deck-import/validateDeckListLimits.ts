import { MAX_CARDS_PER_ZONE } from "@/lib/limits";
import { MAX_COMMANDER_ZONE_CARDS } from "@mtg/shared/constants/limits";
import { getRequestedCounts } from "./counts";
import type { ParsedCard } from "./types";

export const validateDeckListLimits = (
  parsedDeck: ParsedCard[],
  opts?: { maxLibraryCards?: number }
): { ok: true } | { ok: false; error: string } => {
  const { library, commander } = getRequestedCounts(parsedDeck);
  const maxLibraryCards = opts?.maxLibraryCards ?? MAX_CARDS_PER_ZONE;

  if (library > maxLibraryCards) {
    return {
      ok: false,
      error: `Deck too large: ${library} cards would be added to your library, but the current limit is ${maxLibraryCards}.`,
    };
  }

  if (commander > MAX_COMMANDER_ZONE_CARDS) {
    return {
      ok: false,
      error: `Commander section too large: ${commander} cards found, but the current limit is ${MAX_COMMANDER_ZONE_CARDS}.`,
    };
  }

  return { ok: true };
};
