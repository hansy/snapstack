import type { FetchScryfallResult, ParsedCard } from "./types";
import { formatMissingCards } from "./formatMissingCards";
import { formatScryfallErrors } from "@/services/scryfall/scryfallErrors";

export const validateImportResult = (
  parsedDeck: ParsedCard[],
  result: FetchScryfallResult
): { ok: true; warnings: string[] } | { ok: false; error: string } => {
  const expectedCount = parsedDeck.reduce((sum, card) => sum + card.quantity, 0);

  if (result.errors.length) {
    const errorMessage = formatScryfallErrors(result.errors);
    if (result.cards.length === expectedCount && result.missing.length === 0) {
      return { ok: true, warnings: [...result.warnings, errorMessage] };
    }

    if (result.missing.length) {
      return {
        ok: false,
        error: `${errorMessage} Also could not find: ${formatMissingCards(
          result.missing
        )}.`,
      };
    }

    if (result.cards.length === 0) {
      return { ok: false, error: errorMessage };
    }

    return {
      ok: false,
      error: `${errorMessage} Requested ${expectedCount} cards but Scryfall returned ${result.cards.length}.`,
    };
  }

  if (result.missing.length) {
    return {
      ok: false,
      error: `Could not find: ${formatMissingCards(result.missing)}. Please check spelling or set codes.`,
    };
  }

  if (result.cards.length === 0) {
    return {
      ok: false,
      error:
        "Scryfall returned 0 cards. Please check your decklist for typos or set codes.",
    };
  }

  if (result.cards.length !== expectedCount) {
    return {
      ok: false,
      error: `Requested ${expectedCount} cards but Scryfall returned ${result.cards.length}. Please check for typos or ambiguous printings.`,
    };
  }

  return { ok: true, warnings: result.warnings };
};
