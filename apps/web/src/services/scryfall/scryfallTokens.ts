import { ScryfallCard, ScryfallListResult } from "@/types/scryfall";
import { isAbortError } from "@/lib/errors";

export const TOKEN_SEARCH_PREFIX = "(type:token OR type:emblem) (game:paper)";
export const MIN_TOKEN_SEARCH_CHARS = 3;
export const DEFAULT_TOKEN_SEARCH_DEBOUNCE_MS = 300;

export type TokenSearchResult = ScryfallListResult<ScryfallCard>;

export interface TokenSearchOptions {
  unique?: "cards" | "art" | "prints";
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

export interface DebouncedTokenSearchOptions extends TokenSearchOptions {
  debounceMs?: number;
}

export interface DebouncedTokenSearch {
  search: (query: string) => Promise<TokenSearchResult | null>;
  cancel: () => void;
}

export const buildTokenSearchQuery = (query: string) =>
  `${TOKEN_SEARCH_PREFIX} ${query}`.trim();

export const buildTokenSearchUrl = (
  query: string,
  { unique = "cards" }: Pick<TokenSearchOptions, "unique"> = {}
) => {
  const searchQuery = buildTokenSearchQuery(query.trim());
  const params = new URLSearchParams({ q: searchQuery, unique });
  return `https://api.scryfall.com/cards/search?${params.toString()}`;
};

export async function searchScryfallTokens(
  query: string,
  options: TokenSearchOptions = {}
): Promise<TokenSearchResult | null> {
  const trimmedQuery = query.trim();
  if (trimmedQuery.length < MIN_TOKEN_SEARCH_CHARS) {
    return null;
  }

  const { unique, signal, fetchImpl } = options;
  const fetcher = fetchImpl ?? fetch;
  const url = buildTokenSearchUrl(trimmedQuery, { unique });

  const response = await fetcher(url, { signal });
  if (!response.ok) {
    throw new Error(
      `Scryfall token search failed (${response.status} ${response.statusText})`
    );
  }

  return (await response.json()) as TokenSearchResult;
}

export function createDebouncedTokenSearch(
  options: DebouncedTokenSearchOptions = {}
): DebouncedTokenSearch {
  const { debounceMs = DEFAULT_TOKEN_SEARCH_DEBOUNCE_MS, ...searchOptions } =
    options;

  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight: AbortController | null = null;
  let pendingReject: ((reason?: unknown) => void) | null = null;

  const cancelTimers = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const cancelInFlight = () => {
    if (inFlight) {
      inFlight.abort();
      inFlight = null;
    }
  };

  const rejectPending = (message: string) => {
    if (!pendingReject) return;
    const error = new Error(message);
    error.name = "AbortError";
    pendingReject(error);
    pendingReject = null;
  };

  const search = (query: string) => {
    const trimmedQuery = query.trim();

    if (trimmedQuery.length < MIN_TOKEN_SEARCH_CHARS) {
      cancelTimers();
      cancelInFlight();
      rejectPending("Token search aborted: query too short");
      return Promise.resolve(null);
    }

    cancelTimers();
    cancelInFlight();
    rejectPending("Token search superseded");

    return new Promise<TokenSearchResult | null>((resolve, reject) => {
      pendingReject = reject;

      timer = setTimeout(async () => {
        timer = null;
        inFlight = new AbortController();

        try {
          const result = await searchScryfallTokens(trimmedQuery, {
            ...searchOptions,
            signal: inFlight.signal,
          });
          resolve(result);
        } catch (error) {
          if (isAbortError(error)) {
            return;
          }
          reject(error);
        } finally {
          inFlight = null;
          pendingReject = null;
        }
      }, debounceMs);
    });
  };

  const cancel = () => {
    cancelTimers();
    cancelInFlight();
    rejectPending("Token search cancelled");
  };

  return { search, cancel };
}
