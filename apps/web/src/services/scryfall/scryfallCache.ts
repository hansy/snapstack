/**
 * Scryfall Card Cache using IndexedDB + an in-memory LRU.
 *
 * Stores full Scryfall card data locally to avoid:
 * 1. Re-fetching cards we've already seen
 * 2. Syncing large payloads over Yjs (only scryfallId is synced)
 */

import type { ScryfallCard } from "@/types/scryfall";

import { createScryfallCache } from "./cache/createScryfallCache";
import { createIndexedDbStore } from "./cache/indexedDbStore";
import { createLruCache } from "./cache/memoryLru";

const DB_NAME = "mtg-scryfall-cache";
const DB_VERSION = 1;
const STORE_NAME = "cards";

const CACHE_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const MAX_MEMORY_CACHE = 500;
const SCRYFALL_RATE_LIMIT_MS = 100; // Scryfall asks for 50-100ms between requests

const memory = createLruCache<ScryfallCard>({ maxEntries: MAX_MEMORY_CACHE });
const store = createIndexedDbStore({
  dbName: DB_NAME,
  dbVersion: DB_VERSION,
  storeName: STORE_NAME,
});

const cache = createScryfallCache({
  memory,
  store,
  expiryMs: CACHE_EXPIRY_MS,
  rateLimitMs: SCRYFALL_RATE_LIMIT_MS,
});

export const getCard = cache.getCard;
export const getCards = cache.getCards;
export const cacheCards = cache.cacheCards;
export const cleanupExpired = cache.cleanupExpired;
export const clearCache = cache.clearCache;
export const getCacheStats = cache.getCacheStats;
