import type { Card } from "@/types";
import type { ScryfallCard, ScryfallIdentifier } from "@/types/scryfall";
import { toScryfallCardLite } from "@/types/scryfallLite";
import { cacheCards } from "@/services/scryfall/scryfallCache";
import type { FetchScryfallResult, ParsedCard } from "./types";

type ScryfallCollectionResponse = {
  data: ScryfallCard[];
  not_found?: ScryfallIdentifier[];
  warnings?: string[];
};

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
): Partial<Card> & { section: string } => {
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
  fetcher: typeof fetch,
  name: string
): Promise<ScryfallCard | null> => {
  const tryMode = async (mode: "exact" | "fuzzy") => {
    const param = mode === "exact" ? "exact" : "fuzzy";
    try {
      const response = await fetcher(
        `https://api.scryfall.com/cards/named?${param}=${encodeURIComponent(name)}`
      );
      if (!response.ok) return null;
      const data = await response.json();
      if (data.object === "error") return null;
      return data as ScryfallCard;
    } catch {
      return null;
    }
  };

  return (await tryMode("exact")) ?? (await tryMode("fuzzy"));
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
  opts?: { fetchImpl?: typeof fetch }
): Promise<FetchScryfallResult> => {
  const fetcher = opts?.fetchImpl ?? fetch;
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

  const fetchedCards: (Partial<Card> & { section: string })[] = [];
  const missingMap = new Map<string, ParsedCard>();
  const warnings: string[] = [];
  const cardsToCache: ScryfallCard[] = [];

  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
    const identifierChunk = chunks[chunkIndex] ?? [];
    const requestsChunk = requestChunks[chunkIndex] ?? [];

    try {
      const response = await fetcher("https://api.scryfall.com/cards/collection", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ identifiers: identifierChunk }),
      });

      if (!response.ok) {
        warnings.push(
          `Scryfall API error (${response.status} ${response.statusText}). Skipping these cards.`
        );
        requestsChunk.forEach((request) => mergeMissingCard(missingMap, request));
        continue;
      }

      const data = (await response.json()) as ScryfallCollectionResponse;
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
      warnings.push(
        `Error fetching from Scryfall: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      requestsChunk.forEach((request) => mergeMissingCard(missingMap, request));
    }
  }

  // Fallback: attempt exact/fuzzy lookup for each missing request by name
  for (const missingCard of Array.from(missingMap.values())) {
    const resolved = await fetchCardByName(fetcher, missingCard.name);
    if (!resolved) continue;

    cardsToCache.push(resolved);
    missingMap.delete(normalizedKey(missingCard));

    for (let i = 0; i < missingCard.quantity; i++) {
      fetchedCards.push(buildImportedCardPart(resolved, missingCard.section));
    }
  }

  if (cardsToCache.length > 0) {
    cacheCards(cardsToCache).catch((err) => {
      console.warn("[deckImport] Failed to cache cards:", err);
    });
  }

  return { cards: fetchedCards, missing: Array.from(missingMap.values()), warnings };
};

