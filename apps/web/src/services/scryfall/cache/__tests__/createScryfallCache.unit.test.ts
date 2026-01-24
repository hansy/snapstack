import { describe, expect, it, vi } from "vitest";
import type { ScryfallCard } from "@/types/scryfall";
import { createScryfallCache } from "../createScryfallCache";
import { createLruCache } from "../memoryLru";
import type { CachedCard, ScryfallCardStore } from "../store";

const createStore = (seed: CachedCard[] = []): ScryfallCardStore => {
  const map = new Map<string, CachedCard>(seed.map((e) => [e.scryfallId, e]));
  return {
    get: vi.fn(async (id) => map.get(id) ?? null),
    put: vi.fn(async (entry) => {
      map.set(entry.scryfallId, entry);
    }),
    delete: vi.fn(async (id) => {
      map.delete(id);
    }),
    clear: vi.fn(async () => {
      map.clear();
    }),
    cleanupBefore: vi.fn(async (cutoffMs) => {
      let deleted = 0;
      for (const [id, entry] of map.entries()) {
        if (entry.cachedAt <= cutoffMs) {
          map.delete(id);
          deleted++;
        }
      }
      return deleted;
    }),
    count: vi.fn(async () => map.size),
  };
};

const makeCard = (id: string): ScryfallCard =>
  ({
    id,
    name: `Card ${id}`,
  }) as any;

describe("createScryfallCache", () => {
  it("deduplicates concurrent getCard fetches", async () => {
    const fetchFn = vi.fn(async (_url: string) => ({
      ok: true,
      status: 200,
      json: async () => makeCard("c1"),
    })) as unknown as typeof fetch;

    const cache = createScryfallCache({
      memory: createLruCache({ maxEntries: 10 }),
      store: null,
      expiryMs: 1_000,
      fetchFn,
    });

    const p1 = cache.getCard("c1");
    const p2 = cache.getCard("c1");

    expect(fetchFn).toHaveBeenCalledTimes(1);
    await expect(p1).resolves.toEqual({ card: makeCard("c1"), errors: [] });
    await expect(p2).resolves.toEqual({ card: makeCard("c1"), errors: [] });
  });

  it("returns a non-expired store hit without fetching", async () => {
    const now = () => 10_000;
    const store = createStore([{ scryfallId: "c1", data: makeCard("c1"), cachedAt: 9_900 }]);
    const fetchFn = vi.fn(async () => {
      throw new Error("fetch should not be called");
    }) as unknown as typeof fetch;

    const cache = createScryfallCache({
      memory: createLruCache({ maxEntries: 10 }),
      store,
      expiryMs: 1_000,
      now,
      fetchFn,
    });

    const result = await cache.getCard("c1");
    expect(result.card?.id).toBe("c1");
    expect(fetchFn).not.toHaveBeenCalled();

    // Second call should hit memory (store.get called only once).
    const again = await cache.getCard("c1");
    expect(again.card?.id).toBe("c1");
    expect(store.get).toHaveBeenCalledTimes(1);
  });

  it("treats expired store entries as misses and refetches", async () => {
    const now = () => 10_000;
    const store = createStore([{ scryfallId: "c1", data: makeCard("old"), cachedAt: 1 }]);
    const fetchFn = vi.fn(async (_url: string) => ({
      ok: true,
      status: 200,
      json: async () => makeCard("c1"),
    })) as unknown as typeof fetch;

    const cache = createScryfallCache({
      memory: createLruCache({ maxEntries: 10 }),
      store,
      expiryMs: 1_000,
      now,
      fetchFn,
    });

    const result = await cache.getCard("c1");
    expect(result.card?.id).toBe("c1");
    expect(store.delete).toHaveBeenCalledWith("c1");
    expect(store.put).toHaveBeenCalledWith({ scryfallId: "c1", data: makeCard("c1"), cachedAt: 10_000 });
  });

  it("getCards batches missing ids via collection endpoint", async () => {
    const store = createStore([{ scryfallId: "c2", data: makeCard("c2"), cachedAt: 100 }]);

    const fetchFnMock = vi.fn(async (url: string, init?: any) => {
      if (url.endsWith("/cards/collection")) {
        const body = JSON.parse(init?.body ?? "{}");
        const ids = (body.identifiers ?? []).map((x: any) => x.id);
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: ids.map((id: string) => makeCard(id)) }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });

    const memory = createLruCache<ScryfallCard>({ maxEntries: 10 });
    memory.set("c1", makeCard("c1"));

    const cache = createScryfallCache({
      memory,
      store,
      expiryMs: 1_000,
      now: () => 1_000,
      fetchFn: fetchFnMock as unknown as typeof fetch,
      rateLimitMs: 0,
      sleep: async () => {},
    });

    const results = await cache.getCards(["c1", "c2", "c3"]);
    expect(results.cards.get("c1")?.id).toBe("c1");
    expect(results.cards.get("c2")?.id).toBe("c2");
    expect(results.cards.get("c3")?.id).toBe("c3");
    expect(results.errors).toHaveLength(0);

    // Only the collection endpoint should be used (for c3).
    expect(fetchFnMock).toHaveBeenCalledTimes(1);
    expect(String(fetchFnMock.mock.calls[0]?.[0])).toContain("/cards/collection");
  });
});
