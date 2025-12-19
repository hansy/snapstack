import { describe, expect, it } from "vitest";
import { createLruCache } from "../memoryLru";

describe("createLruCache", () => {
  it("evicts the least recently used entry", () => {
    const cache = createLruCache<number>({ maxEntries: 2 });
    cache.set("a", 1);
    cache.set("b", 2);
    // Touch "a" so "b" becomes LRU.
    expect(cache.get("a")).toBe(1);
    cache.set("c", 3);

    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")).toBe(1);
    expect(cache.get("c")).toBe(3);
  });
});

