import { v4 as uuidv4 } from 'uuid';
import { Card, PlayerId, ZoneId, ScryfallCard, ScryfallIdentifier } from '../types';

export interface ParsedCard {
    quantity: number;
    name: string;
    set: string;
    collectorNumber: string;
    section: 'main' | 'commander' | 'sideboard';
}

export interface FetchScryfallResult {
    cards: (Partial<Card> & { section: string })[];
    missing: ParsedCard[];
    warnings: string[];
}

type ScryfallCollectionResponse = {
    data: ScryfallCard[];
    not_found?: ScryfallIdentifier[];
    warnings?: string[];
};

const cardKey = (card: ParsedCard) =>
    `${card.section}:${card.name.toLowerCase()}:${card.set.toLowerCase()}:${card.collectorNumber.toLowerCase()}`;

const fetchCardByName = async (name: string): Promise<ScryfallCard | null> => {
    const tryMode = async (mode: 'exact' | 'fuzzy') => {
        const param = mode === 'exact' ? 'exact' : 'fuzzy';
        try {
            const response = await fetch(`https://api.scryfall.com/cards/named?${param}=${encodeURIComponent(name)}`);
            if (!response.ok) return null;
            const data = await response.json();
            if (data.object === 'error') return null;
            return data as ScryfallCard;
        } catch {
            return null;
        }
    };

    return (await tryMode('exact')) ?? (await tryMode('fuzzy'));
};

const matchesParsedName = (parsed: ParsedCard, scryfallCard: ScryfallCard): boolean => {
    const target = parsed.name.toLowerCase();
    if (scryfallCard.name.toLowerCase() === target) return true;

    const faces = scryfallCard.card_faces ?? [];
    if (faces.some(face => face.name?.toLowerCase() === target)) return true;

    // Handle split/adventure/double-faced by stripping suffix after //
    const canonicalFront = scryfallCard.name.split('//')[0]?.trim().toLowerCase();
    return canonicalFront === target;
};

export const parseDeckList = (text: string): ParsedCard[] => {
    const lines = text.split('\n').filter(line => line.trim() !== '');
    const cards: ParsedCard[] = [];
    let currentSection: 'main' | 'commander' | 'sideboard' = 'main';

    lines.forEach(line => {
        const trimmedLine = line.trim();
        const lowerLine = trimmedLine.toLowerCase();

        // Detect Section Headers
        if (lowerLine === 'commander' || lowerLine.startsWith('commander:')) {
            currentSection = 'commander';
            return;
        }
        if (lowerLine === 'sideboard' || lowerLine.startsWith('sideboard:')) {
            currentSection = 'sideboard';
            return;
        }
        if (lowerLine === 'deck' || lowerLine.startsWith('deck:')) {
            currentSection = 'main';
            return;
        }

        // Headers to ignore (if not section headers)
        const IGNORED_HEADERS = ['companion', 'maybeboard', 'about'];

        if (
            IGNORED_HEADERS.includes(lowerLine) ||
            lowerLine.startsWith('name ') ||
            lowerLine.startsWith('about ')
        ) {
            return;
        }

        // Regex Patterns

        // Pattern A: Detailed Export
        const detailedMatch = trimmedLine.match(/^(\d+x?)\s+(.+?)\s+\(([a-zA-Z0-9]{3,})\)\s+(\S+).*$/);

        if (detailedMatch) {
            cards.push({
                quantity: parseInt(detailedMatch[1].replace('x', ''), 10),
                name: detailedMatch[2].trim(),
                set: detailedMatch[3].toLowerCase(),
                collectorNumber: detailedMatch[4],
                section: currentSection
            });
            return;
        }

        // Pattern B: Simple Quantity + Name
        const simpleMatch = trimmedLine.match(/^(\d+x?)\s+(.+)$/);

        if (simpleMatch) {
            cards.push({
                quantity: parseInt(simpleMatch[1].replace('x', ''), 10),
                name: simpleMatch[2].trim(),
                set: '',
                collectorNumber: '',
                section: currentSection
            });
            return;
        }

        // Pattern C: Just Name
        if (trimmedLine.length > 0) {
            cards.push({
                quantity: 1,
                name: trimmedLine,
                set: '',
                collectorNumber: '',
                section: currentSection
            });
        }
    });

    return cards;
};

export const formatMissingCards = (missing: ParsedCard[]): string => {
    return missing
        .map(card => `${card.quantity}x ${card.name}${card.set ? ` (${card.set.toUpperCase()} ${card.collectorNumber})` : ''}`)
        .join(', ');
};

export const validateImportResult = (
    parsedDeck: ParsedCard[],
    result: FetchScryfallResult
): { ok: true; warnings: string[] } | { ok: false; error: string } => {
    const expectedCount = parsedDeck.reduce((sum, card) => sum + card.quantity, 0);

    if (result.missing.length) {
        return {
            ok: false,
            error: `Could not find: ${formatMissingCards(result.missing)}. Please check spelling or set codes.`,
        };
    }

    if (result.cards.length === 0) {
        return { ok: false, error: 'Scryfall returned 0 cards. Please check your decklist for typos or set codes.' };
    }

    if (result.cards.length !== expectedCount) {
        return {
            ok: false,
            error: `Requested ${expectedCount} cards but Scryfall returned ${result.cards.length}. Please check for typos or ambiguous printings.`,
        };
    }

    return { ok: true, warnings: result.warnings };
};

const identifierMatchesParsedCard = (card: ParsedCard, identifier: ScryfallIdentifier) => {
    if ('set' in identifier && 'collector_number' in identifier && identifier.set && identifier.collector_number) {
        return (
            card.set.toLowerCase() === identifier.set.toLowerCase() &&
            card.collectorNumber.toLowerCase() === identifier.collector_number.toLowerCase()
        );
    }

    if ('name' in identifier && identifier.name) {
        return card.name.toLowerCase() === identifier.name.toLowerCase();
    }

    return false;
};

const mergeMissingCard = (missingMap: Map<string, ParsedCard>, card: ParsedCard) => {
    const key = `${card.section}:${card.name.toLowerCase()}:${card.set}:${card.collectorNumber}`;
    const existing = missingMap.get(key);

    if (existing) {
        missingMap.set(key, { ...existing, quantity: existing.quantity + card.quantity });
    } else {
        missingMap.set(key, { ...card });
    }
};

export const fetchScryfallCards = async (parsedCards: ParsedCard[]): Promise<FetchScryfallResult> => {
    const identifiers: ScryfallIdentifier[] = parsedCards.map(card => {
        if (card.set && card.collectorNumber) {
            return { set: card.set, collector_number: card.collectorNumber };
        }
        return { name: card.name };
    });

    // Scryfall collection API limit is 75 identifiers per request
    const chunks = [];
    for (let i = 0; i < identifiers.length; i += 75) {
        chunks.push(identifiers.slice(i, i + 75));
    }

    const fetchedCards: (Partial<Card> & { section: string })[] = [];
    const remainingQuantities = new Map<string, number>();
    const missingMap = new Map<string, ParsedCard>();
    const warnings: string[] = [];

    parsedCards.forEach(card => {
        remainingQuantities.set(cardKey(card), card.quantity);
    });

    const markChunkAsMissing = (chunk: ScryfallIdentifier[]) => {
        parsedCards.forEach(card => {
            if (chunk.some(identifier => identifierMatchesParsedCard(card, identifier))) {
                mergeMissingCard(missingMap, card);
                remainingQuantities.set(cardKey(card), 0);
            }
        });
    };

    for (const chunk of chunks) {
        try {
            const response = await fetch('https://api.scryfall.com/cards/collection', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ identifiers: chunk }),
            });

            if (!response.ok) {
                warnings.push(`Scryfall API error (${response.status} ${response.statusText}). Skipping these cards.`);
                markChunkAsMissing(chunk);
                continue;
            }

            const data = await response.json() as ScryfallCollectionResponse;

            data.warnings?.forEach(warning => warnings.push(warning));
            if (data.not_found?.length) {
                markChunkAsMissing(data.not_found);
            }

            // Map found cards back to quantities and sections

            data.data.forEach((scryfallCard: ScryfallCard) => {
                const originalRequest = parsedCards.find(pc =>
                    (pc.set === scryfallCard.set && pc.collectorNumber === scryfallCard.collector_number) ||
                    matchesParsedName(pc, scryfallCard)
                );

                if (originalRequest) {
                    for (let i = 0; i < originalRequest.quantity; i++) {
                        const frontFace = scryfallCard.card_faces?.[0];
                        const imageUrl = scryfallCard.image_uris?.normal || frontFace?.image_uris?.normal;
                        const name = frontFace?.name || scryfallCard.name;

                        fetchedCards.push({
                            name,
                            imageUrl: imageUrl,
                            typeLine: scryfallCard.type_line,
                            oracleText: scryfallCard.oracle_text,
                            scryfallId: scryfallCard.id,
                            scryfall: scryfallCard,
                            tapped: false,
                            faceDown: false,
                            currentFaceIndex: 0,
                            rotation: 0,
                            counters: [],
                            position: { x: 0, y: 0 },
                            section: originalRequest.section // Add section here
                        });

                        const key = cardKey(originalRequest);
                        const remaining = remainingQuantities.get(key) ?? 0;
                        remainingQuantities.set(key, Math.max(0, remaining - 1));
                    }
                }
            });

        } catch (error) {
            warnings.push(`Error fetching from Scryfall: ${error instanceof Error ? error.message : String(error)}`);
            markChunkAsMissing(chunk);
        }
    }

    // Derive missing from any remaining quantities or explicit missing entries
    remainingQuantities.forEach((qty, key) => {
        if (qty > 0) {
            const card = parsedCards.find(pc => cardKey(pc) === key);
            if (card) {
                mergeMissingCard(missingMap, { ...card, quantity: qty });
            }
        }
    });

    // Fallback: attempt exact/fuzzy lookup for each offending card by name
    for (const missingCard of Array.from(missingMap.values())) {
        const resolved = await fetchCardByName(missingCard.name);
        if (resolved) {
            missingMap.delete(cardKey(missingCard));
            for (let i = 0; i < missingCard.quantity; i++) {
                const frontFace = resolved.card_faces?.[0];
                const imageUrl = resolved.image_uris?.normal || frontFace?.image_uris?.normal;
                const name = frontFace?.name || resolved.name;
                fetchedCards.push({
                    name,
                    imageUrl,
                    typeLine: resolved.type_line,
                    oracleText: resolved.oracle_text,
                    scryfallId: resolved.id,
                    scryfall: resolved,
                    tapped: false,
                    faceDown: false,
                    currentFaceIndex: 0,
                    rotation: 0,
                    counters: [],
                    position: { x: 0, y: 0 },
                    section: missingCard.section
                });

                const key = cardKey(missingCard);
                remainingQuantities.set(key, 0);
            }
        }
    }

    const missing = Array.from(missingMap.values());

    const expectedCardCount = parsedCards.reduce((sum, card) => sum + card.quantity, 0);
    if (fetchedCards.length + missing.reduce((sum, card) => sum + card.quantity, 0) < expectedCardCount) {
        warnings.push('Some requested cards could not be resolved and were skipped.');
    }

    return { cards: fetchedCards, missing, warnings };
};

export const createCardFromImport = (cardData: Partial<Card>, ownerId: PlayerId, zoneId: ZoneId): Card => {
    return {
        id: uuidv4(),
        ownerId,
        controllerId: ownerId,
        zoneId,
        name: cardData.name || 'Unknown Card',
        imageUrl: cardData.imageUrl,
        typeLine: cardData.typeLine,
        oracleText: cardData.oracleText,
        scryfallId: cardData.scryfallId,
        tapped: false,
        faceDown: false,
        rotation: 0,
        counters: [],
        position: { x: 0, y: 0 },
        ...cardData,
        currentFaceIndex: cardData.currentFaceIndex ?? 0,
    };
};
