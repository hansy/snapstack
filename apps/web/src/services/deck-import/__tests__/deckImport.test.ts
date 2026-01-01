import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchScryfallCards, formatMissingCards, parseDeckList, ParsedCard, validateDeckListLimits, validateImportResult } from '../deckImport';
import { Card, ScryfallCard } from '@/types';

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

const sampleDecklist = `
1 Adeline, Resplendent Cathar
1 Aegis of the Legion
1 Anguished Unmaking
1 Anim Pakal, Thousandth Moon
1 Arcane Signet
1 Archangel Elspeth
1 Attrition
1 Baird, Argivian Recruiter
1 Basri Ket
1 Basri, Devoted Paladin
1 Battle of Hoover Dam
1 Bedevil
1 Boros Garrison
1 Braids, Arisen Nightmare
1 Brimaz, King of Oreskos
1 Captain of the Watch
1 Cathars' Crusade
1 Chivalric Alliance
1 Chocobo Knights
1 Colonel Autumn
1 Command Tower
1 Commander Mustard
1 Company Commander
1 Craig Boone, Novac Guard
1 Elder Arthur Maxson
1 Eldrazi Monument
1 Ellie's Rage
1 Eradicator Valkyrie
1 Etchings of the Chosen
1 Evolving Wilds
1 Exotic Orchard
1 Fain, the Broker
1 Felisa, Fang of Silverquill
1 Fervent Charge
1 Fracture
1 General's Enforcer
1 Ghost Lantern
1 Graven Cairns
1 Hero of Bladehold
1 Isshin, Two Heavens as One
1 Leonin Warleader
1 Lethal Throwdown
1 Liliana, Dreadhorde General
1 Lorehold Campus
1 Lossarnach Captain
1 Militia's Pride
1 Morbid Opportunist
3 Mountain
1 Myrel, Shield of Argive
1 Nomad Outpost
1 Norn's Wellspring
1 Ojer Taq, Deepest Foundation
1 Paladin Class
1 Path of Ancestry
1 Pitiless Plunderer
11 Plains
1 Preeminent Captain
1 Raze the Effigy
1 Reluctant Role Model
1 Requisition Raid
1 Rugged Prairie
1 Securitron Squadron
1 Sephiroth, Fallen Hero
1 Shadrix Silverquill
1 Silverquill Campus
1 Skullclamp
1 Skyknight Vanguard
1 Sol Ring
1 Sothera, the Supervoid
1 Sunhome Stalwart
1 Sunscorched Divide
6 Swamp
1 Swords to Plowshares
1 Terramorphic Expanse
1 Thriving Bluff
1 Thriving Heath
1 Thriving Moor
1 Unclaimed Territory
1 Vault of the Archangel
1 Veteran's Armaments
1 Wear/Tear
1 Windcrag Siege

1 Caesar, Legion's Emperor
`.trim();

const makeCards = (count: number): (Partial<Card> & { section: string })[] =>
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

    it('treats the first blank line as a sideboard separator', () => {
        const text = `
        1 Rampant Growth (DSC) 193
        1 Rishkar's Expertise (PW25) 1

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
        expect(result.warnings[0]).toMatch(/503/);
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
    });
});

describe('validateImportResult', () => {
    it('fails when Scryfall returns zero cards', () => {
        const parsed = parseDeckList('1 Lightning Bolt');
        const validation = validateImportResult(parsed, { cards: [], missing: [], warnings: [] });
        expect(validation.ok).toBe(false);
        if (!validation.ok) {
            expect(validation.error).toMatch(/0 cards/i);
        }
    });

    it('fails with missing card list', () => {
        const parsed: ParsedCard[] = [{ quantity: 1, name: 'Missing Card', set: '', collectorNumber: '', section: 'main' }];
        const validation = validateImportResult(parsed, { cards: [], missing: parsed, warnings: [] });
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
        });

        expect(validation.ok).toBe(true);
        if (validation.ok) {
            expect(validation.warnings).toContain('Using newest printing');
        }
    });
});
