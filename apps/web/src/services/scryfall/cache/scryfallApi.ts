import type { ScryfallCard, ScryfallIdentifier } from "@/types/scryfall";
import {
  buildScryfallHttpError,
  buildScryfallInvalidResponseError,
  buildScryfallNetworkError,
  type ScryfallFetchResult,
  type ScryfallFetchError,
} from "@/services/scryfall/scryfallErrors";

export type Sleep = (ms: number) => Promise<void>;

export const defaultSleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const fetchCardById = async (
  fetchFn: typeof fetch,
  scryfallId: string
): Promise<ScryfallFetchResult<ScryfallCard>> => {
  const url = `https://api.scryfall.com/cards/${scryfallId}`;
  try {
    const response = await fetchFn(url);
    if (!response.ok) {
      return { ok: false, error: buildScryfallHttpError({ endpoint: "card", url, response }) };
    }
    try {
      return { ok: true, data: (await response.json()) as ScryfallCard };
    } catch (error) {
      return {
        ok: false,
        error: buildScryfallInvalidResponseError({ endpoint: "card", url, error }),
      };
    }
  } catch (error) {
    return { ok: false, error: buildScryfallNetworkError({ endpoint: "card", url, error }) };
  }
};

export const fetchCardCollection = async (
  fetchFn: typeof fetch,
  scryfallIds: string[],
  {
    chunkSize = 75,
    rateLimitMs = 100,
    sleep = defaultSleep,
  }: { chunkSize?: number; rateLimitMs?: number; sleep?: Sleep } = {}
): Promise<ScryfallFetchResult<{ cards: Map<string, ScryfallCard>; errors: ScryfallFetchError[] }>> => {
  const results = new Map<string, ScryfallCard>();
  const errors: ScryfallFetchError[] = [];
  const identifiers: ScryfallIdentifier[] = scryfallIds.map((id) => ({ id }));
  const url = "https://api.scryfall.com/cards/collection";

  for (let i = 0; i < identifiers.length; i += chunkSize) {
    const chunk = identifiers.slice(i, i + chunkSize);

    try {
      if (i > 0) {
        await sleep(rateLimitMs);
      }

      const response = await fetchFn(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifiers: chunk }),
      });

      if (!response.ok) {
        errors.push(buildScryfallHttpError({ endpoint: "collection", url, response }));
        continue;
      }

      let data: { data: ScryfallCard[]; not_found?: ScryfallIdentifier[] };
      try {
        data = (await response.json()) as {
          data: ScryfallCard[];
          not_found?: ScryfallIdentifier[];
        };
      } catch (error) {
        errors.push(buildScryfallInvalidResponseError({ endpoint: "collection", url, error }));
        continue;
      }

      if (!Array.isArray(data.data)) {
        errors.push(
          buildScryfallInvalidResponseError({
            endpoint: "collection",
            url,
            error: new Error("Missing data array"),
          })
        );
        continue;
      }

      for (const card of data.data) {
        results.set(card.id, card);
      }
    } catch (error) {
      errors.push(buildScryfallNetworkError({ endpoint: "collection", url, error }));
    }
  }

  return { ok: true, data: { cards: results, errors } };
};
