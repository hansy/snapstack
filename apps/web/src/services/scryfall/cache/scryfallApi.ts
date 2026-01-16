import type { ScryfallCard, ScryfallIdentifier } from "@/types/scryfall";

export type Sleep = (ms: number) => Promise<void>;

export const defaultSleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const fetchCardById = async (fetchFn: typeof fetch, scryfallId: string): Promise<ScryfallCard | null> => {
  try {
    const response = await fetchFn(`https://api.scryfall.com/cards/${scryfallId}`);
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as ScryfallCard;
  } catch {
    return null;
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
): Promise<Map<string, ScryfallCard>> => {
  const results = new Map<string, ScryfallCard>();
  const identifiers: ScryfallIdentifier[] = scryfallIds.map((id) => ({ id }));

  for (let i = 0; i < identifiers.length; i += chunkSize) {
    const chunk = identifiers.slice(i, i + chunkSize);

    try {
      if (i > 0) {
        await sleep(rateLimitMs);
      }

      const response = await fetchFn("https://api.scryfall.com/cards/collection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifiers: chunk }),
      });

      if (!response.ok) continue;

      const data = (await response.json()) as {
        data: ScryfallCard[];
        not_found?: ScryfallIdentifier[];
      };

      for (const card of data.data) {
        results.set(card.id, card);
      }
    } catch {
    }
  }

  return results;
};
