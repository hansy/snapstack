export type LruCache<T> = {
  get: (key: string) => T | undefined;
  set: (key: string, value: T) => void;
  clear: () => void;
  size: () => number;
};

export const createLruCache = <T>({ maxEntries }: { maxEntries: number }): LruCache<T> => {
  const map = new Map<string, T>();

  const get = (key: string) => {
    const value = map.get(key);
    if (value === undefined) return undefined;
    // Refresh recency.
    map.delete(key);
    map.set(key, value);
    return value;
  };

  const set = (key: string, value: T) => {
    if (map.has(key)) map.delete(key);
    map.set(key, value);

    while (map.size > maxEntries) {
      const oldestKey = map.keys().next().value as string | undefined;
      if (!oldestKey) break;
      map.delete(oldestKey);
    }
  };

  return {
    get,
    set,
    clear: () => map.clear(),
    size: () => map.size,
  };
};

