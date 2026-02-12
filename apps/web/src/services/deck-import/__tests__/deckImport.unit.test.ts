import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchScryfallCards, formatMissingCards, parseDeckList, ParsedCard, validateDeckListLimits, validateImportResult } from '../deckImport';
import { Card, ScryfallCard } from '@/types';
import { sampleCommanderDecklist } from '@test/fixtures/decklists';

const baseScryfallCard: ScryfallCard = {
    object: 'card',
    id: 'card-1',
    lang: 'en',
    name: 'Lightning Bolt',
    layout: 'normal',
    uri: 'https://api.scryfall.com/cards/card-1',
    scryfall_uri: 'https://scryfall.com/card/card-1',
    type_line: 'Instant',
    color_identity: ['R'],
    keywords: [],
    legalities: {} as any,
    games: ['paper'],
    set: 'lea',
    set_name: 'Limited Edition Alpha',
    collector_number: '150',
    rarity: 'common',
    prices: {},
    related_uris: {},
    image_uris: { normal: 'https://img.example.com/bolt.png' },
};

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

const sampleDecklist = sampleCommanderDecklist;

const makeCards = (count: number): (Partial<Card> & { section: ParsedCard["section"] })[] =>
    Array.from({ length: count }, (_, idx) => ({
        name: `Card ${idx + 1}`,
        section: 'main',
    }));

describe('parseDeckList', () => {
    it('detects sections and ignores non-card headers', () => {
        const text = `
        Commander:
        1 Atraxa, Praetors' Voice
        About brewed by Codex
        Deck
        2 Forest
        Sideboard
        1 Dispel
        `;

        const parsed = parseDeckList(text);

        expect(parsed).toEqual([
            { quantity: 1, name: "Atraxa, Praetors' Voice", set: '', collectorNumber: '', section: 'commander' },
            { quantity: 2, name: 'Forest', set: '', collectorNumber: '', section: 'main' },
            { quantity: 1, name: 'Dispel', set: '', collectorNumber: '', section: 'sideboard' },
        ]);
    });

    it('requires an explicit sideboard header instead of a blank line', () => {
        const text = `
        1 Rampant Growth (DSC) 193
        1 Rishkar's Expertise (PW25) 1

        Sideboard:
        1 Ancient Bronze Dragon (CLB) 214
        1 Balefire Dragon (CMM) 207
        `;

        const parsed = parseDeckList(text);

        expect(parsed).toEqual([
            { quantity: 1, name: 'Rampant Growth', set: 'dsc', collectorNumber: '193', section: 'main' },
            { quantity: 1, name: "Rishkar's Expertise", set: 'pw25', collectorNumber: '1', section: 'main' },
            { quantity: 1, name: 'Ancient Bronze Dragon', set: 'clb', collectorNumber: '214', section: 'sideboard' },
            { quantity: 1, name: 'Balefire Dragon', set: 'cmm', collectorNumber: '207', section: 'sideboard' },
        ]);
    });

    it('keeps cards in the main section when only separated by blank lines', () => {
        const text = `
        1 Vibrant Cityscape
        1 Winding Way

        1 Six
        `;

        const parsed = parseDeckList(text);

        expect(parsed).toEqual([
            { quantity: 1, name: 'Vibrant Cityscape', set: '', collectorNumber: '', section: 'main' },
            { quantity: 1, name: 'Winding Way', set: '', collectorNumber: '', section: 'main' },
            { quantity: 1, name: 'Six', set: '', collectorNumber: '', section: 'main' },
        ]);
    });
});

describe('validateDeckListLimits', () => {
  it('rejects imports that exceed the library zone limit', () => {
    const parsed: ParsedCard[] = [
      { quantity: 301, name: 'Mountain', set: '', collectorNumber: '', section: 'main' },
    ];

    const result = validateDeckListLimits(parsed, { maxLibraryCards: 300 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/Deck too large/);
      expect(result.error).toMatch(/301/);
      expect(result.error).toMatch(/300/);
    }
  });

  it('allows imports within the library zone limit (commander excluded)', () => {
    const parsed: ParsedCard[] = [
      { quantity: 300, name: 'Mountain', set: '', collectorNumber: '', section: 'main' },
      { quantity: 1, name: "Atraxa, Praetors' Voice", set: '', collectorNumber: '', section: 'commander' },
    ];

    const result = validateDeckListLimits(parsed, { maxLibraryCards: 300 });
    expect(result.ok).toBe(true);
  });

  it('rejects imports with more than two commanders', () => {
    const parsed: ParsedCard[] = [
      { quantity: 3, name: "Atraxa, Praetors' Voice", set: '', collectorNumber: '', section: 'commander' },
    ];

    const result = validateDeckListLimits(parsed, { maxLibraryCards: 300 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/Commander section too large/);
      expect(result.error).toMatch(/3/);
      expect(result.error).toMatch(/2/);
    }
  });
});

describe('fetchScryfallCards', () => {
    it('returns resolved cards and forwards scryfall warnings', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({
                data: [{ ...baseScryfallCard }],
                warnings: ['Using newest printing'],
            }),
        });
        vi.stubGlobal('fetch', fetchMock as any);

        const parsed: ParsedCard[] = [{ quantity: 1, name: 'Lightning Bolt', set: 'lea', collectorNumber: '150', section: 'main' }];
        const result = await fetchScryfallCards(parsed);

        expect(result.cards).toHaveLength(1);
        expect(result.cards[0].name).toBe('Lightning Bolt');
        expect(result.cards[0].section).toBe('main');
        expect(result.missing).toHaveLength(0);
        expect(result.warnings).toContain('Using newest printing');
        expect(result.errors).toHaveLength(0);
    });

    it('surfaces missing cards when Scryfall cannot find them', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    data: [],
                    not_found: [{ name: 'Made Up Card' }],
                }),
            })
            // named endpoint fallback returns an error object
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ object: 'error' }),
            })
            // fuzzy fallback also fails
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ object: 'error' }),
            });
        vi.stubGlobal('fetch', fetchMock as any);

        const parsed: ParsedCard[] = [{ quantity: 2, name: 'Made Up Card', set: '', collectorNumber: '', section: 'main' }];
        const result = await fetchScryfallCards(parsed);

        expect(result.cards).toHaveLength(0);
        expect(result.missing).toHaveLength(1);
        expect(result.missing[0]).toMatchObject({ name: 'Made Up Card', quantity: 2 });
        expect(result.warnings).toHaveLength(0);
        expect(result.errors).toHaveLength(0);
    });

    it('marks a chunk as missing when the API call fails', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce({
                ok: false,
                status: 503,
                statusText: 'Service Unavailable',
            })
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ object: 'error' }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ object: 'error' }),
            });
        vi.stubGlobal('fetch', fetchMock as any);

        const parsed: ParsedCard[] = [{ quantity: 1, name: 'Island', set: '', collectorNumber: '', section: 'main' }];
        const result = await fetchScryfallCards(parsed);

        expect(result.cards).toHaveLength(0);
        expect(result.missing[0]).toMatchObject({ name: 'Island', quantity: 1 });
        expect(result.warnings).toHaveLength(0);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toMatchObject({ kind: 'http', status: 503, endpoint: 'collection' });
    });

    it('retries with backoff when rate limited', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce({
                ok: false,
                status: 429,
                statusText: 'Too Many Requests',
                headers: { get: (key: string) => (key === 'Retry-After' ? '1' : null) },
            })
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    data: [{ ...baseScryfallCard }],
                }),
            });

        const sleep = vi.fn().mockResolvedValue(undefined);

        const parsed: ParsedCard[] = [{ quantity: 1, name: 'Lightning Bolt', set: 'lea', collectorNumber: '150', section: 'main' }];
        const result = await fetchScryfallCards(parsed, {
            fetchImpl: fetchMock as any,
            rateLimitMs: 0,
            maxRetries: 1,
            backoffMs: 50,
            sleep,
        });

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(sleep).toHaveBeenCalledTimes(1);
        expect(sleep).toHaveBeenCalledWith(1000);
        expect(result.cards).toHaveLength(1);
        expect(result.missing).toHaveLength(0);
        expect(result.errors).toHaveLength(0);
    });

    it('falls back to named lookup for split cards like Wear // Tear', async () => {
        const collectionResponse = {
            ok: true,
            json: () => Promise.resolve({
                data: [],
                not_found: [{ name: 'Wear // Tear' }],
            }),
        };
        const namedResponse = {
            ok: true,
            json: () => Promise.resolve({
                ...baseScryfallCard,
                id: 'some-scryfall-id',
                name: 'Wear // Tear',
                type_line: 'Instant // Instant',
                oracle_text: 'Destroy target artifact // Destroy target enchantment',
                collector_number: '222',
            }),
        };

        const fetchMock = vi.fn()
            .mockResolvedValueOnce(collectionResponse as any)
            .mockResolvedValueOnce(namedResponse as any);
        vi.stubGlobal('fetch', fetchMock as any);

        const parsed: ParsedCard[] = [{ quantity: 1, name: 'Wear // Tear', set: '', collectorNumber: '', section: 'main' }];
        const result = await fetchScryfallCards(parsed);

        expect(result.missing).toHaveLength(0);
        expect(result.cards).toHaveLength(1);
        expect(result.cards[0].name).toBe('Wear // Tear');
        // scryfallId should be set (lite version doesn't have 'name' at root)
        expect(result.cards[0].scryfallId).toBe('some-scryfall-id');
        expect(result.errors).toHaveLength(0);
    });

    it('falls back to fuzzy lookup when exact named fails', async () => {
        const collectionResponse = {
            ok: true,
            json: () => Promise.resolve({
                data: [],
                not_found: [{ name: 'Nicol B' }],
            }),
        };
        const exactError = {
            ok: true,
            json: () => Promise.resolve({ object: 'error' }),
        };
        const fuzzySuccess = {
            ok: true,
            json: () => Promise.resolve({
                ...baseScryfallCard,
                name: 'Nicol Bolas, the Ravager',
            }),
        };

        const fetchMock = vi.fn()
            .mockResolvedValueOnce(collectionResponse as any)
            .mockResolvedValueOnce(exactError as any)
            .mockResolvedValueOnce(fuzzySuccess as any);

        vi.stubGlobal('fetch', fetchMock as any);

        const parsed: ParsedCard[] = [{ quantity: 1, name: 'Nicol B', set: '', collectorNumber: '', section: 'main' }];
        const result = await fetchScryfallCards(parsed);

        expect(result.missing).toHaveLength(0);
        expect(result.cards).toHaveLength(1);
        expect(result.cards[0].name).toBe('Nicol Bolas, the Ravager');
        expect(result.errors).toHaveLength(0);
    });

    it('matches front-face names for double-faced cards (e.g., Ojer Taq, Deepest Foundation // Temple of Civilization)', async () => {
        const dfcCard: ScryfallCard = {
            ...baseScryfallCard,
            name: 'Ojer Taq, Deepest Foundation // Temple of Civilization',
            type_line: 'Legendary Creature — God // Legendary Land',
            oracle_text: 'Front face text',
            card_faces: [
                { name: 'Ojer Taq, Deepest Foundation', oracle_text: 'Front', type_line: 'Legendary Creature', image_uris: { normal: 'front.png' } },
                { name: 'Temple of Civilization', oracle_text: 'Back', type_line: 'Legendary Land', image_uris: { normal: 'back.png' } },
            ],
        };

        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({
                data: [dfcCard],
            }),
        });
        vi.stubGlobal('fetch', fetchMock as any);

        const parsed: ParsedCard[] = [{ quantity: 1, name: 'Ojer Taq, Deepest Foundation', set: '', collectorNumber: '', section: 'main' }];
        const result = await fetchScryfallCards(parsed);

        expect(result.missing).toHaveLength(0);
        expect(result.cards).toHaveLength(1);
        expect(result.cards[0].name).toBe('Ojer Taq, Deepest Foundation');
        expect(result.errors).toHaveLength(0);
    });

    it('resolves duplicate requests across sections without named fallback', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({
                data: [{ ...baseScryfallCard }],
            }),
        });
        vi.stubGlobal('fetch', fetchMock as any);

        const parsed: ParsedCard[] = [
            { quantity: 2, name: 'Lightning Bolt', set: 'lea', collectorNumber: '150', section: 'main' },
            { quantity: 1, name: 'Lightning Bolt', set: 'lea', collectorNumber: '150', section: 'commander' },
        ];
        const result = await fetchScryfallCards(parsed);

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(result.missing).toHaveLength(0);
        expect(result.cards).toHaveLength(3);
        expect(result.cards.filter((c) => c.section === 'main')).toHaveLength(2);
        expect(result.cards.filter((c) => c.section === 'commander')).toHaveLength(1);
        expect(result.errors).toHaveLength(0);
    });

    it('matches slash-separated split names in collection results (Wear/Tear)', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({
                data: [
                    {
                        ...baseScryfallCard,
                        id: 'wear-tear',
                        name: 'Wear // Tear',
                        type_line: 'Instant // Instant',
                        oracle_text: 'Destroy target artifact // Destroy target enchantment',
                        collector_number: '222',
                    },
                ],
            }),
        });
        vi.stubGlobal('fetch', fetchMock as any);

        const parsed: ParsedCard[] = [{ quantity: 1, name: 'Wear/Tear', set: '', collectorNumber: '', section: 'main' }];
        const result = await fetchScryfallCards(parsed);

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(result.missing).toHaveLength(0);
        expect(result.cards).toHaveLength(1);
        expect(result.cards[0].name).toBe('Wear // Tear');
        expect(result.cards[0].scryfallId).toBe('wear-tear');
        expect(result.errors).toHaveLength(0);
    });
});

describe('validateImportResult', () => {
    it('fails when Scryfall returns zero cards', () => {
        const parsed = parseDeckList('1 Lightning Bolt');
        const validation = validateImportResult(parsed, { cards: [], missing: [], warnings: [], errors: [] });
        expect(validation.ok).toBe(false);
        if (!validation.ok) {
            expect(validation.error).toMatch(/0 cards/i);
        }
    });

    it('surfaces Scryfall fetch errors with a clear message', () => {
        const parsed = parseDeckList('1 Lightning Bolt');
        const validation = validateImportResult(parsed, {
            cards: [],
            missing: [],
            warnings: [],
            errors: [
                {
                    kind: 'http',
                    endpoint: 'collection',
                    url: 'https://api.scryfall.com/cards/collection',
                    status: 503,
                    statusText: 'Service Unavailable',
                    message: 'Scryfall responded with 503 Service Unavailable',
                },
            ],
        });
        expect(validation.ok).toBe(false);
        if (!validation.ok) {
            expect(validation.error).toMatch(/temporarily unavailable/i);
            expect(validation.error).toMatch(/503/);
        }
    });

    it('fails with missing card list', () => {
        const parsed: ParsedCard[] = [{ quantity: 1, name: 'Missing Card', set: '', collectorNumber: '', section: 'main' }];
        const validation = validateImportResult(parsed, { cards: [], missing: parsed, warnings: [], errors: [] });
        expect(validation.ok).toBe(false);
        if (!validation.ok) {
            expect(validation.error).toContain('Missing Card');
            expect(validation.error).toContain(formatMissingCards(parsed));
        }
    });

    it('fails when counts mismatch using provided decklist', () => {
        const parsed = parseDeckList(sampleDecklist);
        const requested = parsed.reduce((sum, card) => sum + card.quantity, 0);
        const validation = validateImportResult(parsed, {
            cards: makeCards(requested - 1),
            missing: [{ quantity: 1, name: 'Missing', set: '', collectorNumber: '', section: 'main' }],
            warnings: [],
            errors: [],
        });

        expect(validation.ok).toBe(false);
        if (!validation.ok) {
            expect(validation.error).toContain('Missing');
        }
    });

    it('passes through when counts match and nothing is missing', () => {
        const parsed = parseDeckList('2 Island');
        const validation = validateImportResult(parsed, {
            cards: makeCards(2),
            missing: [],
            warnings: ['Using newest printing'],
            errors: [],
        });

        expect(validation.ok).toBe(true);
        if (validation.ok) {
            expect(validation.warnings).toContain('Using newest printing');
        }
    });
});
