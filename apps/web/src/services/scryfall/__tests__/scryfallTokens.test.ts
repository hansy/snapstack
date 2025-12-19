import { describe, it, expect, vi } from "vitest";
import { ScryfallCard } from "@/types/scryfall";
import {
  buildTokenSearchUrl,
  createDebouncedTokenSearch,
  MIN_TOKEN_SEARCH_CHARS,
  searchScryfallTokens,
} from "../scryfallTokens";

const mockTokenCard: ScryfallCard = {
  object: "card",
  id: "token-1",
  lang: "en",
  name: "Mock Token",
  layout: "token",
  uri: "https://api.scryfall.com/cards/token-1",
  scryfall_uri: "https://scryfall.com/card/token-1",
  type_line: "Token Creature — Mock",
  color_identity: [],
  keywords: [],
  legalities: {} as any,
  games: ["paper"],
  set: "tset",
  set_name: "Test Set",
  collector_number: "1",
  rarity: "common",
  prices: {},
  related_uris: {},
};

const mockListResponse = {
  object: "list" as const,
  total_cards: 1,
  has_more: false,
  data: [mockTokenCard],
};

describe("buildTokenSearchUrl", () => {
  it("includes the token prefix, game filter, and unique=cards by default", () => {
    const url = buildTokenSearchUrl("soldier");
    const parsed = new URL(url);

    expect(parsed.pathname).toBe("/cards/search");
    expect(parsed.searchParams.get("unique")).toBe("cards");
    expect(parsed.searchParams.get("q")).toBe(
      "(type:token OR type:emblem) (game:paper) soldier"
    );
  });
});

describe("searchScryfallTokens", () => {
  it("skips calls when under the minimum length", async () => {
    const fetchMock = vi.fn();
    const result = await searchScryfallTokens(
      "a".repeat(MIN_TOKEN_SEARCH_CHARS - 1),
      {
        fetchImpl: fetchMock as any,
      }
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });
});

describe("createDebouncedTokenSearch", () => {
  it("debounces and only sends the latest request", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockListResponse),
    });

    const { search } = createDebouncedTokenSearch({
      fetchImpl: fetchMock as any,
      debounceMs: 10,
    });

    const first = search("sold");
    const second = search("soldier");

    // First call should be superseded immediately
    await expect(first).rejects.toThrowError(/superseded/);

    // Wait for debounce window to elapse and the latest request to fire.
    await new Promise((resolve) => setTimeout(resolve, 15));

    await expect(second).resolves.toEqual(mockListResponse);
    await expect(first).rejects.toThrowError(/superseded/);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(new URL(calledUrl).searchParams.get("q")).toBe(
      "(type:token OR type:emblem) (game:paper) soldier"
    );
  });

  it("cancels a pending request cleanly", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockListResponse),
    });

    const { search, cancel } = createDebouncedTokenSearch({
      fetchImpl: fetchMock as any,
      debounceMs: 50,
    });

    const pending = search("angel");
    cancel();

    await expect(pending).rejects.toThrowError(/cancelled/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
