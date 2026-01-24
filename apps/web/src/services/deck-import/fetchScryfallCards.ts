import type { Card } from "@/types";
import type { ScryfallCard, ScryfallIdentifier } from "@/types/scryfall";
import { toScryfallCardLite } from "@/types/scryfallLite";
import { cacheCards } from "@/services/scryfall/scryfallCache";
import {
  buildScryfallHttpError,
  buildScryfallInvalidResponseError,
  buildScryfallNetworkError,
  type ScryfallFetchError,
  type ScryfallFetchResult,
} from "@/services/scryfall/scryfallErrors";
import type { FetchScryfallResult, ParsedCard } from "./types";

type ScryfallCollectionResponse = {
  data: ScryfallCard[];
  not_found?: ScryfallIdentifier[];
  warnings?: string[];
};

type Sleep = (ms: number) => Promise<void>;

type FetchScryfallOptions = {
  fetchImpl?: typeof fetch;
  rateLimitMs?: number;
  maxRetries?: number;
  backoffMs?: number;
  sleep?: Sleep;
};

const DEFAULT_RATE_LIMIT_MS = 100;
const DEFAULT_BACKOFF_MS = 250;
const DEFAULT_MAX_RETRIES = 2;

const defaultSleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const normalizeQuantity = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;

const normalizedKey = (card: ParsedCard) =>
  `${card.section}:${card.name.trim().toLowerCase()}:${card.set
    .trim()
    .toLowerCase()}:${card.collectorNumber.trim().toLowerCase()}`;

const mergeParsedCards = (parsed: ParsedCard[]): ParsedCard[] => {
  const merged = new Map<string, ParsedCard>();

  parsed.forEach((card) => {
    const key = normalizedKey(card);
    const existing = merged.get(key);
    const nextQty = normalizeQuantity(card.quantity);

    if (existing) {
      merged.set(key, { ...existing, quantity: existing.quantity + nextQty });
      return;
    }

    merged.set(key, {
      ...card,
      quantity: nextQty,
      name: card.name.trim(),
      set: card.set.trim().toLowerCase(),
      collectorNumber: card.collectorNumber.trim(),
    });
  });

  return Array.from(merged.values());
};

const matchesParsedName = (parsed: ParsedCard, scryfallCard: ScryfallCard): boolean => {
  const normalizeName = (value: string) =>
    value
      .toLowerCase()
      .replace(/\s*\/\/\s*/g, "/")
      .replace(/\s*\/\s*/g, "/")
      .trim();

  const target = normalizeName(parsed.name);
  if (normalizeName(scryfallCard.name) === target) return true;

  const faces = scryfallCard.card_faces ?? [];
  if (faces.some((face) => (face.name ? normalizeName(face.name) === target : false))) {
    return true;
  }

  // Handle split/adventure/double-faced by stripping suffix after //
  const canonicalFront = normalizeName(scryfallCard.name.split("//")[0]?.trim() ?? "");
  return canonicalFront === target;
};

const buildImportedCardPart = (
  scryfallCard: ScryfallCard,
  section: ParsedCard["section"]
): Partial<Card> & { section: ParsedCard["section"] } => {
  const frontFace = scryfallCard.card_faces?.[0];
  const name = frontFace?.name || scryfallCard.name;
  const power = scryfallCard.power ?? frontFace?.power;
  const toughness = scryfallCard.toughness ?? frontFace?.toughness;

  return {
    name,
    // imageUrl omitted - use scryfall.image_uris.normal instead
    typeLine: scryfallCard.type_line,
    // oracleText omitted - fetch on-demand from cache when needed
    scryfallId: scryfallCard.id,
    // Store only lite version for sync efficiency
    scryfall: toScryfallCardLite(scryfallCard),
    tapped: false,
    faceDown: false,
    currentFaceIndex: 0,
    rotation: 0,
    counters: [],
    position: { x: 0, y: 0 },
    // Pre-initialize P/T so we don't need full scryfall data later
    power,
    toughness,
    basePower: power,
    baseToughness: toughness,
    section,
  };
};

const resolveRequestFromChunk = (
  request: ParsedCard,
  cards: ScryfallCard[]
): ScryfallCard | null => {
  if (request.set && request.collectorNumber) {
    const set = request.set.toLowerCase();
    const cn = request.collectorNumber.toLowerCase();
    return (
      cards.find(
        (card) =>
          card.set.toLowerCase() === set &&
          card.collector_number.toLowerCase() === cn
      ) ?? null
    );
  }

  return cards.find((card) => matchesParsedName(request, card)) ?? null;
};

const mergeMissingCard = (missingMap: Map<string, ParsedCard>, card: ParsedCard) => {
  const key = normalizedKey(card);
  const existing = missingMap.get(key);

  if (existing) {
    missingMap.set(key, {
      ...existing,
      quantity: existing.quantity + normalizeQuantity(card.quantity),
    });
  } else {
    missingMap.set(key, { ...card, quantity: normalizeQuantity(card.quantity) });
  }
};

const fetchCardByName = async (
  request: (url: string, init?: RequestInit) => Promise<Response>,
  name: string
): Promise<ScryfallFetchResult<ScryfallCard | null>> => {
  const tryMode = async (mode: "exact" | "fuzzy"): Promise<ScryfallFetchResult<ScryfallCard | null>> => {
    const param = mode === "exact" ? "exact" : "fuzzy";
    const url = `https://api.scryfall.com/cards/named?${param}=${encodeURIComponent(name)}`;
    try {
      const response = await request(url);
      if (!response.ok) {
        if (response.status === 404) {
          return { ok: true, data: null };
        }
        return { ok: false, error: buildScryfallHttpError({ endpoint: "named", url, response }) };
      }
      let data: unknown;
      try {
        data = await response.json();
      } catch (error) {
        return {
          ok: false,
          error: buildScryfallInvalidResponseError({ endpoint: "named", url, error }),
        };
      }
      if ((data as { object?: string })?.object === "error") return { ok: true, data: null };
      return { ok: true, data: data as ScryfallCard };
    } catch (error) {
      return { ok: false, error: buildScryfallNetworkError({ endpoint: "named", url, error }) };
    }
  };

  const exact = await tryMode("exact");
  if (!exact.ok || exact.data) return exact;
  return await tryMode("fuzzy");
};

const chunkArray = <T,>(items: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

export const fetchScryfallCards = async (
  parsedCards: ParsedCard[],
  opts?: FetchScryfallOptions
): Promise<FetchScryfallResult> => {
  const fetcher = opts?.fetchImpl ?? fetch;
  const rateLimitMs = opts?.rateLimitMs ?? DEFAULT_RATE_LIMIT_MS;
  const maxRetries = opts?.maxRetries ?? DEFAULT_MAX_RETRIES;
  const backoffMs = opts?.backoffMs ?? DEFAULT_BACKOFF_MS;
  const sleep = opts?.sleep ?? defaultSleep;
  let requestCount = 0;

  const getRetryDelayMs = (response: Response | null, attempt: number) => {
    const retryAfter = response?.headers.get("Retry-After");
    if (retryAfter) {
      const asSeconds = Number(retryAfter);
      if (Number.isFinite(asSeconds)) {
        return Math.max(0, asSeconds * 1000);
      }
    }
    return backoffMs * Math.pow(2, attempt);
  };

  const rateLimitedRequest = async (url: string, init?: RequestInit) => {
    let attempt = 0;

    while (true) {
      if (rateLimitMs > 0 && requestCount > 0) {
        await sleep(rateLimitMs);
      }
      requestCount += 1;

      let response: Response;
      try {
        response = await fetcher(url, init);
      } catch (error) {
        if (attempt < maxRetries) {
          await sleep(getRetryDelayMs(null, attempt));
          attempt += 1;
          continue;
        }
        throw error;
      }

      if (response.status === 429 && attempt < maxRetries) {
        await sleep(getRetryDelayMs(response, attempt));
        attempt += 1;
        continue;
      }

      return response;
    }
  };

  const mergedRequests = mergeParsedCards(parsedCards);
  const identifiers: ScryfallIdentifier[] = mergedRequests.map((card) => {
    if (card.set && card.collectorNumber) {
      return { set: card.set, collector_number: card.collectorNumber };
    }
    return { name: card.name };
  });

  // Scryfall collection API limit is 75 identifiers per request
  const chunks = chunkArray(identifiers, 75);
  const requestChunks = chunkArray(mergedRequests, 75);

  const fetchedCards: (Partial<Card> & { section: ParsedCard["section"] })[] = [];
  const missingMap = new Map<string, ParsedCard>();
  const warnings: string[] = [];
  const errors: ScryfallFetchError[] = [];
  const cardsToCache: ScryfallCard[] = [];
  const collectionUrl = "https://api.scryfall.com/cards/collection";

  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
    const identifierChunk = chunks[chunkIndex] ?? [];
    const requestsChunk = requestChunks[chunkIndex] ?? [];

    try {
      const response = await rateLimitedRequest(collectionUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ identifiers: identifierChunk }),
      });

      if (!response.ok) {
        errors.push(buildScryfallHttpError({ endpoint: "collection", url: collectionUrl, response }));
        requestsChunk.forEach((request) => mergeMissingCard(missingMap, request));
        continue;
      }

      let data: ScryfallCollectionResponse;
      try {
        data = (await response.json()) as ScryfallCollectionResponse;
      } catch (error) {
        errors.push(
          buildScryfallInvalidResponseError({ endpoint: "collection", url: collectionUrl, error })
        );
        requestsChunk.forEach((request) => mergeMissingCard(missingMap, request));
        continue;
      }

      if (!Array.isArray(data.data)) {
        errors.push(
          buildScryfallInvalidResponseError({
            endpoint: "collection",
            url: collectionUrl,
            error: new Error("Missing data array"),
          })
        );
        requestsChunk.forEach((request) => mergeMissingCard(missingMap, request));
        continue;
      }
      data.warnings?.forEach((warning) => warnings.push(warning));
      data.data.forEach((scryfallCard) => cardsToCache.push(scryfallCard));

      requestsChunk.forEach((request) => {
        const resolved = resolveRequestFromChunk(request, data.data);
        if (!resolved) {
          mergeMissingCard(missingMap, request);
          return;
        }

        for (let i = 0; i < request.quantity; i++) {
          fetchedCards.push(buildImportedCardPart(resolved, request.section));
        }
      });
    } catch (error) {
      errors.push(buildScryfallNetworkError({ endpoint: "collection", url: collectionUrl, error }));
      requestsChunk.forEach((request) => mergeMissingCard(missingMap, request));
    }
  }

  // Fallback: attempt exact/fuzzy lookup for each missing request by name
  for (const missingCard of Array.from(missingMap.values())) {
    const resolvedResult = await fetchCardByName(rateLimitedRequest, missingCard.name);
    if (!resolvedResult.ok) {
      errors.push(resolvedResult.error);
      continue;
    }
    const resolved = resolvedResult.data;
    if (!resolved) continue;

    cardsToCache.push(resolved);
    missingMap.delete(normalizedKey(missingCard));

    for (let i = 0; i < missingCard.quantity; i++) {
      fetchedCards.push(buildImportedCardPart(resolved, missingCard.section));
    }
  }

  if (cardsToCache.length > 0) {
    cacheCards(cardsToCache).catch(() => {});
  }

  return { cards: fetchedCards, missing: Array.from(missingMap.values()), warnings, errors };
};
