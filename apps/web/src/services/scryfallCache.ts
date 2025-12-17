/**
 * Scryfall Card Cache using IndexedDB
 *
 * Stores full Scryfall card data locally to avoid:
 * 1. Re-fetching cards we've already seen
 * 2. Syncing large payloads over Yjs (only scryfallId is synced)
 *
 * Features:
 * - Persistent IndexedDB storage
 * - Batch fetch from Scryfall API with rate limiting
 * - In-memory LRU cache for hot data
 * - Automatic cache expiry (30 days)
 */

import { ScryfallCard, ScryfallIdentifier } from '../types/scryfall';

const DB_NAME = 'mtg-scryfall-cache';
const DB_VERSION = 1;
const STORE_NAME = 'cards';
const CACHE_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const MAX_MEMORY_CACHE = 500;
const SCRYFALL_RATE_LIMIT_MS = 100; // Scryfall asks for 50-100ms between requests

interface CachedCard {
  scryfallId: string;
  data: ScryfallCard;
  cachedAt: number;
}

// In-memory LRU cache for frequently accessed cards
const memoryCache = new Map<string, ScryfallCard>();
const memoryCacheOrder: string[] = [];

// Track pending fetches to deduplicate concurrent requests
const pendingFetches = new Map<string, Promise<ScryfallCard | null>>();

let db: IDBDatabase | null = null;
let dbInitPromise: Promise<IDBDatabase> | null = null;
const hasIndexedDB = typeof indexedDB !== "undefined";

/**
 * Initialize the IndexedDB database
 */
const initDB = (): Promise<IDBDatabase> => {
  if (!hasIndexedDB) {
    return Promise.reject(new Error("IndexedDB is not available"));
  }
  if (db) return Promise.resolve(db);
  if (dbInitPromise) return dbInitPromise;

  dbInitPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('[scryfallCache] Failed to open IndexedDB:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;

      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, {
          keyPath: 'scryfallId',
        });
        store.createIndex('cachedAt', 'cachedAt', { unique: false });
      }
    };
  });

  return dbInitPromise;
};

/**
 * Add to memory cache with LRU eviction
 */
const addToMemoryCache = (id: string, card: ScryfallCard) => {
  // Remove if already exists (will re-add at end)
  const existingIdx = memoryCacheOrder.indexOf(id);
  if (existingIdx !== -1) {
    memoryCacheOrder.splice(existingIdx, 1);
  }

  // Evict oldest if at capacity
  while (memoryCacheOrder.length >= MAX_MEMORY_CACHE) {
    const oldestId = memoryCacheOrder.shift();
    if (oldestId) memoryCache.delete(oldestId);
  }

  memoryCache.set(id, card);
  memoryCacheOrder.push(id);
};

/**
 * Get a card from IndexedDB
 */
const getFromDB = async (scryfallId: string): Promise<ScryfallCard | null> => {
  if (!hasIndexedDB) return null;
  try {
    const database = await initDB();
    return new Promise((resolve) => {
      const tx = database.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(scryfallId);

      request.onsuccess = () => {
        const cached = request.result as CachedCard | undefined;
        if (!cached) {
          resolve(null);
          return;
        }

        // Check expiry
        if (Date.now() - cached.cachedAt > CACHE_EXPIRY_MS) {
          // Expired - delete and return null
          deleteFromDB(scryfallId);
          resolve(null);
          return;
        }

        resolve(cached.data);
      };

      request.onerror = () => {
        console.warn('[scryfallCache] Error reading from DB:', request.error);
        resolve(null);
      };
    });
  } catch {
    return null;
  }
};

/**
 * Store a card in IndexedDB
 */
const storeInDB = async (card: ScryfallCard): Promise<void> => {
  if (!hasIndexedDB) return;
  try {
    const database = await initDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      const cached: CachedCard = {
        scryfallId: card.id,
        data: card,
        cachedAt: Date.now(),
      };

      const request = store.put(cached);
      request.onsuccess = () => resolve();
      request.onerror = () => {
        console.warn('[scryfallCache] Error writing to DB:', request.error);
        reject(request.error);
      };
    });
  } catch (err) {
    console.warn('[scryfallCache] Failed to store card:', err);
  }
};

/**
 * Delete a card from IndexedDB
 */
const deleteFromDB = async (scryfallId: string): Promise<void> => {
  if (!hasIndexedDB) return;
  try {
    const database = await initDB();
    return new Promise((resolve) => {
      const tx = database.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(scryfallId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve(); // Don't fail on delete errors
    });
  } catch {
    // Ignore errors
  }
};

/**
 * Fetch a card from Scryfall API by ID
 */
const fetchFromScryfall = async (
  scryfallId: string
): Promise<ScryfallCard | null> => {
  try {
    const response = await fetch(
      `https://api.scryfall.com/cards/${scryfallId}`
    );
    if (!response.ok) {
      console.warn(
        `[scryfallCache] Scryfall returned ${response.status} for ${scryfallId}`
      );
      return null;
    }
    return (await response.json()) as ScryfallCard;
  } catch (err) {
    console.warn('[scryfallCache] Network error fetching card:', err);
    return null;
  }
};

/**
 * Get a card by Scryfall ID
 * Checks: memory cache → IndexedDB → Scryfall API
 */
export const getCard = async (
  scryfallId: string
): Promise<ScryfallCard | null> => {
  if (!scryfallId) return null;

  // 1. Check memory cache
  const memoryCached = memoryCache.get(scryfallId);
  if (memoryCached) {
    return memoryCached;
  }

  // 2. Check for pending fetch (dedupe concurrent requests)
  const pending = pendingFetches.get(scryfallId);
  if (pending) {
    return pending;
  }

  // 3. Create a promise for this fetch
  const fetchPromise = (async () => {
    // Check IndexedDB
    const dbCached = await getFromDB(scryfallId);
    if (dbCached) {
      addToMemoryCache(scryfallId, dbCached);
      return dbCached;
    }

    // Fetch from Scryfall
    const card = await fetchFromScryfall(scryfallId);
    if (card) {
      addToMemoryCache(card.id, card);
      await storeInDB(card);
    }

    return card;
  })();

  pendingFetches.set(scryfallId, fetchPromise);

  try {
    return await fetchPromise;
  } finally {
    pendingFetches.delete(scryfallId);
  }
};

/**
 * Get multiple cards, batching Scryfall requests efficiently
 */
export const getCards = async (
  scryfallIds: string[]
): Promise<Map<string, ScryfallCard>> => {
  const results = new Map<string, ScryfallCard>();
  const toFetchFromDB: string[] = [];
  const toFetchFromAPI: string[] = [];

  // 1. Check memory cache
  for (const id of scryfallIds) {
    const cached = memoryCache.get(id);
    if (cached) {
      results.set(id, cached);
    } else {
      toFetchFromDB.push(id);
    }
  }

  // 2. Check IndexedDB for remaining
  const dbResults = await Promise.all(toFetchFromDB.map(getFromDB));
  toFetchFromDB.forEach((id, idx) => {
    const card = dbResults[idx];
    if (card) {
      results.set(id, card);
      addToMemoryCache(id, card);
    } else {
      toFetchFromAPI.push(id);
    }
  });

  // 3. Batch fetch from Scryfall API (max 75 per request)
  if (toFetchFromAPI.length > 0) {
    const identifiers: ScryfallIdentifier[] = toFetchFromAPI.map((id) => ({
      id,
    }));

    // Split into chunks of 75
    for (let i = 0; i < identifiers.length; i += 75) {
      const chunk = identifiers.slice(i, i + 75);

      try {
        // Rate limit between requests
        if (i > 0) {
          await new Promise((r) => setTimeout(r, SCRYFALL_RATE_LIMIT_MS));
        }

        const response = await fetch(
          'https://api.scryfall.com/cards/collection',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifiers: chunk }),
          }
        );

        if (response.ok) {
          const data = (await response.json()) as {
            data: ScryfallCard[];
            not_found?: ScryfallIdentifier[];
          };

          for (const card of data.data) {
            results.set(card.id, card);
            addToMemoryCache(card.id, card);
            // Store in DB async (don't await)
            storeInDB(card);
          }
        }
      } catch (err) {
        console.warn('[scryfallCache] Batch fetch error:', err);
      }
    }
  }

  return results;
};

/**
 * Pre-populate the cache with cards (e.g., during deck import)
 * This stores full card data but doesn't return it
 */
export const cacheCards = async (cards: ScryfallCard[]): Promise<void> => {
  for (const card of cards) {
    addToMemoryCache(card.id, card);
    // Store in DB async
    storeInDB(card);
  }
};

/**
 * Clear expired entries from the cache
 */
export const cleanupExpired = async (): Promise<number> => {
  if (!hasIndexedDB) return 0;
  try {
    const database = await initDB();
    const cutoff = Date.now() - CACHE_EXPIRY_MS;
    let deleted = 0;

    return new Promise((resolve) => {
      const tx = database.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('cachedAt');
      const range = IDBKeyRange.upperBound(cutoff);
      const request = index.openCursor(range);

      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          cursor.delete();
          deleted++;
          cursor.continue();
        }
      };

      tx.oncomplete = () => resolve(deleted);
      tx.onerror = () => resolve(deleted);
    });
  } catch {
    return 0;
  }
};

/**
 * Clear the entire cache
 */
export const clearCache = async (): Promise<void> => {
  memoryCache.clear();
  memoryCacheOrder.length = 0;

  if (!hasIndexedDB) return;
  try {
    const database = await initDB();
    return new Promise((resolve) => {
      const tx = database.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Ignore errors
  }
};

/**
 * Get cache statistics
 */
export const getCacheStats = async (): Promise<{
  memoryCount: number;
  dbCount: number;
}> => {
  if (!hasIndexedDB) {
    return { memoryCount: memoryCache.size, dbCount: 0 };
  }
  let dbCount = 0;

  try {
    const database = await initDB();
    dbCount = await new Promise((resolve) => {
      const tx = database.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(0);
    });
  } catch {
    // Ignore
  }

  return {
    memoryCount: memoryCache.size,
    dbCount,
  };
};
