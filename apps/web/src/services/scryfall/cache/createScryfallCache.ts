import type { ScryfallCard } from "@/types/scryfall";

import type { LruCache } from "./memoryLru";
import type { ScryfallCardStore } from "./store";
import { fetchCardById, fetchCardCollection, type Sleep } from "./scryfallApi";

export type ScryfallCache = {
  getCard: (scryfallId: string) => Promise<ScryfallCard | null>;
  getCards: (scryfallIds: string[]) => Promise<Map<string, ScryfallCard>>;
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
  const pendingFetches = new Map<string, Promise<ScryfallCard | null>>();

  const isExpired = (cachedAt: number) => now() - cachedAt > expiryMs;

  const getCard: ScryfallCache["getCard"] = async (scryfallId) => {
    if (!scryfallId) return null;

    const memoryHit = memory.get(scryfallId);
    if (memoryHit) return memoryHit;

    const pending = pendingFetches.get(scryfallId);
    if (pending) return pending;

    const promise = (async () => {
      if (store) {
        const entry = await store.get(scryfallId);
        if (entry) {
          if (isExpired(entry.cachedAt)) {
            // Expired: best-effort delete, then treat as a miss.
            store.delete(scryfallId);
          } else {
            memory.set(scryfallId, entry.data);
            return entry.data;
          }
        }
      }

      const card = await fetchCardById(fetchFn, scryfallId);
      if (card) {
        memory.set(card.id, card);
        if (store) {
          await store.put({ scryfallId: card.id, data: card, cachedAt: now() });
        }
      }

      return card;
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
      const entries = await Promise.all(toCheckStore.map((id) => store.get(id)));
      toCheckStore.forEach((id, idx) => {
        const entry = entries[idx];
        if (entry && !isExpired(entry.cachedAt)) {
          results.set(id, entry.data);
          memory.set(id, entry.data);
          return;
        }

        if (entry && isExpired(entry.cachedAt)) {
          store.delete(id);
        }

        toFetch.push(id);
      });
    } else {
      toFetch.push(...toCheckStore);
    }

    if (toFetch.length > 0) {
      const fetched = await fetchCardCollection(fetchFn, toFetch, { rateLimitMs, sleep });
      for (const [id, card] of fetched.entries()) {
        results.set(id, card);
        memory.set(id, card);
        // Store async (best-effort), don't block the batch.
        store?.put({ scryfallId: card.id, data: card, cachedAt: now() });
      }
    }

    return results;
  };

  const cacheCards: ScryfallCache["cacheCards"] = async (cards) => {
    for (const card of cards) {
      memory.set(card.id, card);
      store?.put({ scryfallId: card.id, data: card, cachedAt: now() });
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

