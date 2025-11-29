import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { useGameStore } from './gameStore';
import { ZONE } from '../constants/zones';

const makeZone = (id: string, type: keyof typeof ZONE, ownerId: string, cardIds: string[] = []) => ({
  id,
  type: ZONE[type],
  ownerId,
  cardIds,
});

const makeCard = (id: string, zoneId: string, ownerId: string, tapped = false) => ({
  id,
  name: 'Test Card',
  ownerId,
  controllerId: ownerId,
  zoneId,
  tapped,
  faceDown: false,
  position: { x: 0, y: 0 },
  rotation: 0,
  counters: [],
});

describe('gameStore move/tap interactions', () => {
  const createMemoryStorage = () => {
    const store = new Map<string, string>();
    return {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value); },
      removeItem: (key: string) => { store.delete(key); },
      clear: () => store.clear(),
      key: (index: number) => Array.from(store.keys())[index] ?? null,
      get length() {
        return store.size;
      },
    } as Storage;
  };

  beforeAll(() => {
    if (typeof globalThis.localStorage === 'undefined') {
      Object.defineProperty(globalThis, 'localStorage', {
        value: createMemoryStorage(),
        configurable: true,
      });
    }
  });

  beforeEach(() => {
    localStorage.clear();
    useGameStore.setState({
      cards: {},
      zones: {},
      players: {},
      myPlayerId: 'me',
    });
  });

  it('untaps when moving out of the battlefield', () => {
    const battlefield = makeZone('bf-me', 'BATTLEFIELD', 'me', ['c1']);
    const exile = makeZone('exile-me', 'EXILE', 'me', []);

    const card = makeCard('c1', battlefield.id, 'me', true);

    useGameStore.setState((state) => ({
      zones: { ...state.zones, [battlefield.id]: battlefield, [exile.id]: exile },
      cards: { ...state.cards, [card.id]: card },
    }));

    useGameStore.getState().moveCard(card.id, exile.id, undefined, 'me');

    const moved = useGameStore.getState().cards[card.id];
    expect(moved.zoneId).toBe(exile.id);
    expect(moved.tapped).toBe(false);
  });

  it('removes a token that leaves the battlefield', () => {
    const battlefield = makeZone('bf-me', 'BATTLEFIELD', 'me', ['t1']);
    const graveyard = makeZone('gy-me', 'GRAVEYARD', 'me', []);

    const token = { ...makeCard('t1', battlefield.id, 'me', true), isToken: true };

    useGameStore.setState((state) => ({
      zones: { ...state.zones, [battlefield.id]: battlefield, [graveyard.id]: graveyard },
      cards: { ...state.cards, [token.id]: token },
    }));

    useGameStore.getState().moveCard(token.id, graveyard.id, undefined, 'me');

    const state = useGameStore.getState();
    expect(state.cards[token.id]).toBeUndefined();
    expect(state.zones[battlefield.id].cardIds).not.toContain(token.id);
    expect(state.zones[graveyard.id].cardIds).not.toContain(token.id);
  });

  it('removes a token when moved to the bottom of a non-battlefield zone', () => {
    const battlefield = makeZone('bf-me', 'BATTLEFIELD', 'me', ['t2']);
    const library = makeZone('lib-me', 'LIBRARY', 'me', []);

    const token = { ...makeCard('t2', battlefield.id, 'me'), isToken: true };

    useGameStore.setState((state) => ({
      zones: { ...state.zones, [battlefield.id]: battlefield, [library.id]: library },
      cards: { ...state.cards, [token.id]: token },
    }));

    useGameStore.getState().moveCardToBottom(token.id, library.id, 'me');

    const state = useGameStore.getState();
    expect(state.cards[token.id]).toBeUndefined();
    expect(state.zones[battlefield.id].cardIds).not.toContain(token.id);
    expect(state.zones[library.id].cardIds).not.toContain(token.id);
  });

  it('denies tapping a card that is not on the battlefield', () => {
    const hand = makeZone('hand-me', 'HAND', 'me', ['c2']);
    const card = makeCard('c2', hand.id, 'me', false);

    useGameStore.setState((state) => ({
      zones: { ...state.zones, [hand.id]: hand },
      cards: { ...state.cards, [card.id]: card },
    }));

    useGameStore.getState().tapCard(card.id, 'me');

    const updated = useGameStore.getState().cards[card.id];
    expect(updated.tapped).toBe(false);
  });

  it('reorders cards within a zone for the owner', () => {
    const graveyard = makeZone('gy-me', 'GRAVEYARD', 'me', ['c3', 'c4', 'c5']);
    const cardsInZone = [
      makeCard('c3', graveyard.id, 'me', false),
      makeCard('c4', graveyard.id, 'me', false),
      makeCard('c5', graveyard.id, 'me', false),
    ];

    useGameStore.setState((state) => ({
      zones: { ...state.zones, [graveyard.id]: graveyard },
      cards: {
        ...state.cards,
        ...cardsInZone.reduce((acc, card) => ({ ...acc, [card.id]: card }), {}),
      },
    }));

    useGameStore.getState().reorderZoneCards(graveyard.id, ['c5', 'c3', 'c4'], 'me');

    expect(useGameStore.getState().zones[graveyard.id].cardIds).toEqual(['c5', 'c3', 'c4']);

    // Non-owner cannot reorder
    useGameStore.getState().reorderZoneCards(graveyard.id, ['c4', 'c5', 'c3'], 'opponent');
    expect(useGameStore.getState().zones[graveyard.id].cardIds).toEqual(['c5', 'c3', 'c4']);
  });

  it('ignores counter additions outside the battlefield', () => {
    const hand = makeZone('hand-me', 'HAND', 'me', ['c6']);
    const card = makeCard('c6', hand.id, 'me', false);

    useGameStore.setState((state) => ({
      zones: { ...state.zones, [hand.id]: hand },
      cards: { ...state.cards, [card.id]: card },
    }));

    useGameStore.getState().addCounterToCard(card.id, { type: '+1/+1', count: 1 });

    expect(useGameStore.getState().cards[card.id].counters).toEqual([]);
  });

  it('removes counters when a card leaves the battlefield', () => {
    const battlefield = makeZone('bf-me', 'BATTLEFIELD', 'me', ['c7']);
    const graveyard = makeZone('gy-me', 'GRAVEYARD', 'me', []);
    const card = { ...makeCard('c7', battlefield.id, 'me'), counters: [{ type: '+1/+1', count: 2 }] };

    useGameStore.setState((state) => ({
      zones: { ...state.zones, [battlefield.id]: battlefield, [graveyard.id]: graveyard },
      cards: { ...state.cards, [card.id]: card },
    }));

    useGameStore.getState().moveCard(card.id, graveyard.id, undefined, 'me');

    const moved = useGameStore.getState().cards[card.id];
    expect(moved.zoneId).toBe(graveyard.id);
    expect(moved.counters).toEqual([]);
  });

  it('clears counters when resetting the deck', () => {
    const battlefield = makeZone('bf-me', 'BATTLEFIELD', 'me', ['c8']);
    const library = makeZone('lib-me', 'LIBRARY', 'me', []);
    const card = { ...makeCard('c8', battlefield.id, 'me'), counters: [{ type: '+1/+1', count: 3 }] };

    useGameStore.setState((state) => ({
      zones: { ...state.zones, [battlefield.id]: battlefield, [library.id]: library },
      cards: { ...state.cards, [card.id]: card },
    }));

    useGameStore.getState().resetDeck('me', 'me');

    const resetCard = useGameStore.getState().cards[card.id];
    expect(resetCard.zoneId).toBe(library.id);
    expect(resetCard.counters).toEqual([]);
  });
});
