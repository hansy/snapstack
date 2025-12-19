import type { CachedCard, ScryfallCardStore } from "./store";

export type IndexedDbStoreOptions = {
  dbName: string;
  dbVersion: number;
  storeName: string;
  /**
   * Provide a custom IndexedDB implementation (useful for tests).
   */
  indexedDb?: IDBFactory;
};

export const createIndexedDbStore = ({
  dbName,
  dbVersion,
  storeName,
  indexedDb = typeof indexedDB !== "undefined" ? indexedDB : undefined,
}: IndexedDbStoreOptions): ScryfallCardStore | null => {
  const hasIndexedDb = Boolean(indexedDb) && typeof IDBKeyRange !== "undefined";
  if (!hasIndexedDb || !indexedDb) return null;

  let db: IDBDatabase | null = null;
  let dbInitPromise: Promise<IDBDatabase> | null = null;

  const initDb = (): Promise<IDBDatabase> => {
    if (db) return Promise.resolve(db);
    if (dbInitPromise) return dbInitPromise;

    dbInitPromise = new Promise((resolve, reject) => {
      const request = indexedDb.open(dbName, dbVersion);

      request.onerror = () => {
        console.error("[scryfallCache] Failed to open IndexedDB:", request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        db = request.result;
        resolve(db);
      };

      request.onupgradeneeded = (event) => {
        const database = (event.target as IDBOpenDBRequest).result;

        if (!database.objectStoreNames.contains(storeName)) {
          const store = database.createObjectStore(storeName, { keyPath: "scryfallId" });
          store.createIndex("cachedAt", "cachedAt", { unique: false });
        }
      };
    });

    return dbInitPromise;
  };

  const get: ScryfallCardStore["get"] = async (scryfallId) => {
    try {
      const database = await initDb();
      return await new Promise<CachedCard | null>((resolve) => {
        const tx = database.transaction(storeName, "readonly");
        const store = tx.objectStore(storeName);
        const request = store.get(scryfallId);

        request.onsuccess = () => resolve((request.result as CachedCard | undefined) ?? null);
        request.onerror = () => {
          console.warn("[scryfallCache] Error reading from DB:", request.error);
          resolve(null);
        };
      });
    } catch {
      return null;
    }
  };

  const put: ScryfallCardStore["put"] = async (entry) => {
    try {
      const database = await initDb();
      await new Promise<void>((resolve, reject) => {
        const tx = database.transaction(storeName, "readwrite");
        const store = tx.objectStore(storeName);
        const request = store.put(entry);

        request.onsuccess = () => resolve();
        request.onerror = () => {
          console.warn("[scryfallCache] Error writing to DB:", request.error);
          reject(request.error);
        };
      });
    } catch (err) {
      console.warn("[scryfallCache] Failed to store card:", err);
    }
  };

  const del: ScryfallCardStore["delete"] = async (scryfallId) => {
    try {
      const database = await initDb();
      await new Promise<void>((resolve) => {
        const tx = database.transaction(storeName, "readwrite");
        const store = tx.objectStore(storeName);
        store.delete(scryfallId);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } catch {
      // Ignore errors
    }
  };

  const clear: ScryfallCardStore["clear"] = async () => {
    try {
      const database = await initDb();
      await new Promise<void>((resolve) => {
        const tx = database.transaction(storeName, "readwrite");
        const store = tx.objectStore(storeName);
        store.clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } catch {
      // Ignore errors
    }
  };

  const count: ScryfallCardStore["count"] = async () => {
    try {
      const database = await initDb();
      return await new Promise<number>((resolve) => {
        const tx = database.transaction(storeName, "readonly");
        const store = tx.objectStore(storeName);
        const request = store.count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(0);
      });
    } catch {
      return 0;
    }
  };

  const cleanupBefore: ScryfallCardStore["cleanupBefore"] = async (cutoffMs) => {
    try {
      const database = await initDb();
      let deleted = 0;

      return await new Promise<number>((resolve) => {
        const tx = database.transaction(storeName, "readwrite");
        const store = tx.objectStore(storeName);
        const index = store.index("cachedAt");
        const range = IDBKeyRange.upperBound(cutoffMs);
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

  return {
    get,
    put,
    delete: del,
    clear,
    cleanupBefore,
    count,
  };
};

