import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGameStore } from '../gameStore';
import { ZONE } from '@/constants/zones';
import { ensureLocalStorage } from '../testUtils';
import { acquireSession, destroySession, flushPendingMutations, setActiveSession } from '@/yjs/docManager';

describe('gameStore deck management', () => {
  beforeAll(() => {
    ensureLocalStorage();
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

  const buildZone = (id: string, type: keyof typeof ZONE, ownerId: string, cardIds: string[] = []) => ({
    id,
    type: ZONE[type],
    ownerId,
    cardIds,
  });

	  it('resets deck by returning owned non-token cards to library and removing tokens', () => {
	    const library = buildZone('lib-me', 'LIBRARY', 'me', ['c1']);
	    const graveyard = buildZone('gy-me', 'GRAVEYARD', 'me', ['c2']);
	    const exile = buildZone('ex-me', 'EXILE', 'me', ['c3']);
	    const battlefield = buildZone('bf-me', 'BATTLEFIELD', 'me', ['t1']);

    useGameStore.setState((state) => ({
      ...state,
      zones: { [library.id]: library, [graveyard.id]: graveyard, [exile.id]: exile, [battlefield.id]: battlefield },
      players: { me: { id: 'me', name: 'Me', life: 40, counters: [], commanderDamage: {}, commanderTax: 0, deckLoaded: true } },
      cards: {
        c1: { id: 'c1', name: 'Card1', ownerId: 'me', controllerId: 'me', zoneId: library.id, tapped: false, faceDown: false, position: { x: 0, y: 0 }, rotation: 0, counters: [] },
        c2: { id: 'c2', name: 'Card2', ownerId: 'me', controllerId: 'me', zoneId: graveyard.id, tapped: false, faceDown: false, position: { x: 0, y: 0 }, rotation: 0, counters: [] },
        c3: { id: 'c3', name: 'Card3', ownerId: 'me', controllerId: 'me', zoneId: exile.id, tapped: false, faceDown: false, position: { x: 0, y: 0 }, rotation: 0, counters: [] },
        t1: { id: 't1', name: 'Token', ownerId: 'me', controllerId: 'me', zoneId: battlefield.id, tapped: false, faceDown: false, position: { x: 0, y: 0 }, rotation: 0, counters: [], isToken: true },
      },
    }));

    useGameStore.getState().resetDeck('me', 'me');

    const state = useGameStore.getState();
    expect(state.cards.t1).toBeUndefined();
    const libraryZone = state.zones[library.id];
    expect(libraryZone.cardIds).toHaveLength(3);
    expect(new Set(libraryZone.cardIds)).toEqual(new Set(['c1', 'c2', 'c3']));
	    expect(state.zones[graveyard.id].cardIds).toEqual([]);
	    expect(state.zones[exile.id].cardIds).toEqual([]);
	    expect(state.zones[battlefield.id].cardIds).toEqual([]);
	  });

    it('clears reveal metadata for all cards in the library on reset', () => {
      const library = buildZone('lib-me', 'LIBRARY', 'me', ['c1', 'o1']);
      const graveyard = buildZone('gy-me', 'GRAVEYARD', 'me', ['c2']);

      useGameStore.setState((state) => ({
        ...state,
        zones: { [library.id]: library, [graveyard.id]: graveyard },
        players: { me: { id: 'me', name: 'Me', life: 40, counters: [], commanderDamage: {}, commanderTax: 0, deckLoaded: true } },
        cards: {
          c1: { id: 'c1', name: 'Card1', ownerId: 'me', controllerId: 'me', zoneId: library.id, tapped: false, faceDown: false, position: { x: 0, y: 0 }, rotation: 0, counters: [], knownToAll: true, revealedToAll: true, revealedTo: ['opponent'] },
          c2: { id: 'c2', name: 'Card2', ownerId: 'me', controllerId: 'me', zoneId: graveyard.id, tapped: false, faceDown: false, position: { x: 0, y: 0 }, rotation: 0, counters: [], knownToAll: true, revealedToAll: true, revealedTo: ['opponent'] },
          o1: { id: 'o1', name: 'Other', ownerId: 'opp', controllerId: 'opp', zoneId: library.id, tapped: false, faceDown: false, position: { x: 0, y: 0 }, rotation: 0, counters: [], knownToAll: true, revealedToAll: true, revealedTo: ['me'] },
        },
      }));

      useGameStore.getState().resetDeck('me', 'me');

      const state = useGameStore.getState();
      expect(state.cards.c1.knownToAll).toBe(false);
      expect(state.cards.c1.revealedToAll).toBe(false);
      expect(state.cards.c1.revealedTo ?? []).toHaveLength(0);

      expect(state.cards.c2.knownToAll).toBe(false);
      expect(state.cards.c2.revealedToAll).toBe(false);
    expect(state.cards.c2.revealedTo ?? []).toHaveLength(0);

    expect(state.cards.o1.knownToAll).toBe(false);
    expect(state.cards.o1.revealedToAll).toBe(false);
    expect(state.cards.o1.revealedTo ?? []).toHaveLength(0);
  });

  it('clears card modifications when resetting the deck', () => {
    const library = buildZone('lib-me', 'LIBRARY', 'me', []);
    const battlefield = buildZone('bf-me', 'BATTLEFIELD', 'me', ['c1']);

    useGameStore.setState((state) => ({
      ...state,
      zones: { [library.id]: library, [battlefield.id]: battlefield },
      players: { me: { id: 'me', name: 'Me', life: 40, counters: [], commanderDamage: {}, commanderTax: 0, deckLoaded: true } },
      cards: {
        c1: {
          id: 'c1',
          name: 'Card1',
          ownerId: 'me',
          controllerId: 'opp',
          zoneId: battlefield.id,
          tapped: true,
          faceDown: true,
          position: { x: 0.2, y: 0.4 },
          rotation: 90,
          counters: [{ type: '+1/+1', count: 1 }],
          customText: 'Note',
          power: '5',
          toughness: '6',
          basePower: '2',
          baseToughness: '3',
        },
      },
    }));

    useGameStore.getState().resetDeck('me', 'me');

    const resetCard = useGameStore.getState().cards.c1;
    expect(resetCard.zoneId).toBe(library.id);
    expect(resetCard.controllerId).toBe('me');
    expect(resetCard.rotation).toBe(0);
    expect(resetCard.customText).toBeUndefined();
    expect(resetCard.tapped).toBe(false);
    expect(resetCard.faceDown).toBe(false);
    expect(resetCard.power).toBe('2');
    expect(resetCard.toughness).toBe('3');
    expect(resetCard.basePower).toBe('2');
    expect(resetCard.baseToughness).toBe('3');
  });

  it('mulligan avoids reset/draw actions when no session is active', () => {
    setActiveSession(null);
    const library = buildZone('lib-me', 'LIBRARY', 'me', ['c1']);
    const hand = buildZone('hand-me', 'HAND', 'me', ['c2']);

    useGameStore.setState((state) => ({
      ...state,
      zones: { [library.id]: library, [hand.id]: hand },
      players: { me: { id: 'me', name: 'Me', life: 40, counters: [], commanderDamage: {}, commanderTax: 0, deckLoaded: true } },
      cards: {
        c1: { id: 'c1', name: 'Card1', ownerId: 'me', controllerId: 'me', zoneId: library.id, tapped: false, faceDown: false, position: { x: 0, y: 0 }, rotation: 0, counters: [] },
        c2: { id: 'c2', name: 'Card2', ownerId: 'me', controllerId: 'me', zoneId: hand.id, tapped: false, faceDown: false, position: { x: 0, y: 0 }, rotation: 0, counters: [] },
      },
    }));

    const state = useGameStore.getState();
    const resetSpy = vi.spyOn(state, 'resetDeck');
    const drawSpy = vi.spyOn(state, 'drawCard');

    state.mulligan('me', 1, 'me');

    expect(resetSpy).not.toHaveBeenCalled();
    expect(drawSpy).not.toHaveBeenCalled();

    const nextState = useGameStore.getState();
    expect(nextState.zones[library.id].cardIds).toHaveLength(1);
    expect(nextState.zones[hand.id].cardIds).toHaveLength(1);

    resetSpy.mockRestore();
    drawSpy.mockRestore();

    const sessionId = 'mulligan-local-clear';
    acquireSession(sessionId);
    setActiveSession(sessionId);
    flushPendingMutations();
    destroySession(sessionId);
    setActiveSession(null);
  });

	  it('keeps commander-zone cards in place when resetting the deck', () => {
	    const library = buildZone('lib-me', 'LIBRARY', 'me', ['c1']);
	    const commander = buildZone('cmd-me', 'COMMANDER', 'me', ['c4']);
	    const battlefield = buildZone('bf-me', 'BATTLEFIELD', 'me', ['c2']);

	    useGameStore.setState((state) => ({
	      ...state,
	      zones: { [library.id]: library, [commander.id]: commander, [battlefield.id]: battlefield },
	      players: { me: { id: 'me', name: 'Me', life: 40, counters: [], commanderDamage: {}, commanderTax: 0, deckLoaded: true } },
	      cards: {
	        c1: { id: 'c1', name: 'Card1', ownerId: 'me', controllerId: 'me', zoneId: library.id, tapped: false, faceDown: false, position: { x: 0, y: 0 }, rotation: 0, counters: [] },
	        c2: { id: 'c2', name: 'Card2', ownerId: 'me', controllerId: 'me', zoneId: battlefield.id, tapped: false, faceDown: false, position: { x: 0, y: 0 }, rotation: 0, counters: [] },
	        c4: { id: 'c4', name: 'Commander', ownerId: 'me', controllerId: 'me', zoneId: commander.id, tapped: false, faceDown: false, position: { x: 0, y: 0 }, rotation: 0, counters: [] },
	      },
	    }));

	    useGameStore.getState().resetDeck('me', 'me');

	    const state = useGameStore.getState();
	    expect(state.zones[commander.id].cardIds).toEqual(['c4']);
	    expect(state.cards.c4.zoneId).toBe(commander.id);
	    expect(state.zones[library.id].cardIds).toHaveLength(2);
	    expect(new Set(state.zones[library.id].cardIds)).toEqual(new Set(['c1', 'c2']));
	  });

	  it('unloads deck by removing owned cards and marking deck as not loaded', () => {
	    const library = buildZone('lib-me', 'LIBRARY', 'me', ['c1', 'c2']);
	    const graveyard = buildZone('gy-me', 'GRAVEYARD', 'me', ['c3']);

    useGameStore.setState((state) => ({
      ...state,
      zones: { [library.id]: library, [graveyard.id]: graveyard },
      players: { me: { id: 'me', name: 'Me', life: 40, counters: [], commanderDamage: {}, commanderTax: 0, deckLoaded: true } },
      cards: {
        c1: { id: 'c1', name: 'Card1', ownerId: 'me', controllerId: 'me', zoneId: library.id, tapped: false, faceDown: false, position: { x: 0, y: 0 }, rotation: 0, counters: [] },
        c2: { id: 'c2', name: 'Card2', ownerId: 'me', controllerId: 'me', zoneId: library.id, tapped: false, faceDown: false, position: { x: 0, y: 0 }, rotation: 0, counters: [] },
        c3: { id: 'c3', name: 'Card3', ownerId: 'me', controllerId: 'me', zoneId: graveyard.id, tapped: false, faceDown: false, position: { x: 0, y: 0 }, rotation: 0, counters: [] },
      },
    }));

    useGameStore.getState().unloadDeck('me', 'me');

    const state = useGameStore.getState();
    expect(state.cards).toEqual({});
    expect(state.zones[library.id].cardIds).toEqual([]);
    expect(state.zones[graveyard.id].cardIds).toEqual([]);
    expect(state.players.me.deckLoaded).toBe(false);
  });
});
