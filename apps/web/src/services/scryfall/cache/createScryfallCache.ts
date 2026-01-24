import type { ScryfallCard } from "@/types/scryfall";
import type { ScryfallFetchError } from "@/services/scryfall/scryfallErrors";

import type { LruCache } from "./memoryLru";
import type { CachedCard, ScryfallCardStore } from "./store";
import { fetchCardById, fetchCardCollection, type Sleep } from "./scryfallApi";

export type ScryfallCache = {
  getCard: (
    scryfallId: string
  ) => Promise<{ card: ScryfallCard | null; errors: ScryfallFetchError[] }>;
  getCards: (
    scryfallIds: string[]
  ) => Promise<{ cards: Map<string, ScryfallCard>; errors: ScryfallFetchError[] }>;
  cacheCards: (cards: ScryfallCard[]) => Promise<void>;
  cleanupExpired: () => Promise<number>;
  clearCache: () => Promise<void>;
  getCacheStats: () => Promise<{ memoryCount: number; dbCount: number }>;
};

export const createScryfallCache = ({
  memory,
  store,
  expiryMs,
  fetchFn = fetch,
  now = () => Date.now(),
  rateLimitMs,
  sleep,
}: {
  memory: LruCache<ScryfallCard>;
  store: ScryfallCardStore | null;
  expiryMs: number;
  fetchFn?: typeof fetch;
  now?: () => number;
  rateLimitMs?: number;
  sleep?: Sleep;
}): ScryfallCache => {
  const pendingFetches = new Map<
    string,
    Promise<{ card: ScryfallCard | null; errors: ScryfallFetchError[] }>
  >();

  const isExpired = (cachedAt: number) => now() - cachedAt > expiryMs;

  const deleteExpiredEntry = (scryfallId: string) => {
    void store?.delete(scryfallId);
  };

  const resolveStoreEntry = (scryfallId: string, entry: CachedCard | null) => {
    if (!entry) return null;
    if (isExpired(entry.cachedAt)) {
      // Expired: best-effort delete, then treat as a miss.
      deleteExpiredEntry(scryfallId);
      return null;
    }

    return entry.data;
  };

  const readFromStore = async (scryfallId: string) => {
    if (!store) return null;

    const entry = await store.get(scryfallId);
    const card = resolveStoreEntry(scryfallId, entry);
    if (card) {
      memory.set(scryfallId, card);
    }

    return card;
  };

  const writeToCache = async (
    card: ScryfallCard,
    { awaitStore }: { awaitStore: boolean }
  ) => {
    memory.set(card.id, card);
    if (!store) return;

    const write = store.put({ scryfallId: card.id, data: card, cachedAt: now() });
    if (awaitStore) {
      await write;
    }
  };

  const getCard: ScryfallCache["getCard"] = async (scryfallId) => {
    if (!scryfallId) return { card: null, errors: [] };

    const memoryHit = memory.get(scryfallId);
    if (memoryHit) return { card: memoryHit, errors: [] };

    const pending = pendingFetches.get(scryfallId);
    if (pending) return pending;

    const promise = (async () => {
      if (store) {
        const storeHit = await readFromStore(scryfallId);
        if (storeHit) return { card: storeHit, errors: [] };
      }

      const cardResult = await fetchCardById(fetchFn, scryfallId);
      if (cardResult.ok) {
        await writeToCache(cardResult.data, { awaitStore: true });
        return { card: cardResult.data, errors: [] };
      }
      console.error("[scryfallCache] Failed to fetch card:", cardResult.error);
      return { card: null, errors: [cardResult.error] };
    })();

    pendingFetches.set(scryfallId, promise);
    try {
      return await promise;
    } finally {
      pendingFetches.delete(scryfallId);
    }
  };

  const getCards: ScryfallCache["getCards"] = async (scryfallIds) => {
    const results = new Map<string, ScryfallCard>();
    const errors: ScryfallFetchError[] = [];
    const toCheckStore: string[] = [];
    const toFetch: string[] = [];

    for (const id of scryfallIds) {
      const hit = memory.get(id);
      if (hit) {
        results.set(id, hit);
      } else {
        toCheckStore.push(id);
      }
    }

    if (store && toCheckStore.length > 0) {
      const entries = await Promise.all(toCheckStore.map((id) => readFromStore(id)));
      toCheckStore.forEach((id, idx) => {
        const card = entries[idx];
        if (card) {
          results.set(id, card);
          return;
        }

        toFetch.push(id);
      });
    } else {
      toFetch.push(...toCheckStore);
    }

    if (toFetch.length > 0) {
      const fetched = await fetchCardCollection(fetchFn, toFetch, { rateLimitMs, sleep });
      if (fetched.ok) {
        for (const [id, card] of fetched.data.cards.entries()) {
          results.set(id, card);
          // Store async (best-effort), don't block the batch.
          void writeToCache(card, { awaitStore: false });
        }
        if (fetched.data.errors.length > 0) {
          errors.push(...fetched.data.errors);
          fetched.data.errors.forEach((error) => {
            console.error("[scryfallCache] Failed to fetch cards:", error);
          });
        }
      } else {
        errors.push(fetched.error);
        console.error("[scryfallCache] Failed to fetch cards:", fetched.error);
      }
    }

    return { cards: results, errors };
  };

  const cacheCards: ScryfallCache["cacheCards"] = async (cards) => {
    for (const card of cards) {
      void writeToCache(card, { awaitStore: false });
    }
  };

  const cleanupExpired: ScryfallCache["cleanupExpired"] = async () => {
    if (!store) return 0;
    return store.cleanupBefore(now() - expiryMs);
  };

  const clearCache: ScryfallCache["clearCache"] = async () => {
    memory.clear();
    pendingFetches.clear();
    await store?.clear();
  };

  const getCacheStats: ScryfallCache["getCacheStats"] = async () => {
    return {
      memoryCount: memory.size(),
      dbCount: store ? await store.count() : 0,
    };
  };

  return { getCard, getCards, cacheCards, cleanupExpired, clearCache, getCacheStats };
};
