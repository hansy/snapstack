import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { useGameStore } from '../gameStore';
import { ZONE } from '@/constants/zones';
import { GRID_STEP_X, GRID_STEP_Y, getNormalizedGridSteps } from '@/lib/positions';
import { ensureLocalStorage } from '@test/utils/storage';

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

  it('clears reveal metadata when moving to bottom of the library', () => {
    const hand = makeZone('hand-me', 'HAND', 'me', ['cBottom']);
    const library = makeZone('lib-me', 'LIBRARY', 'me', []);

    const card = {
      ...makeCard('cBottom', hand.id, 'me', false),
      knownToAll: true,
      revealedToAll: true,
      revealedTo: ['opponent'],
    };

    useGameStore.setState((state) => ({
      zones: { ...state.zones, [hand.id]: hand, [library.id]: library },
      cards: { ...state.cards, [card.id]: card },
    }));

    useGameStore.getState().moveCardToBottom(card.id, library.id, 'me');

    const moved = useGameStore.getState().cards[card.id];
    expect(moved.zoneId).toBe(library.id);
    expect(moved.knownToAll).toBe(false);
    expect(moved.revealedToAll).toBe(false);
    expect(moved.revealedTo ?? []).toHaveLength(0);
  });

  it('clears faceDown when moving to bottom of a non-battlefield zone', () => {
    const battlefield = makeZone('bf-me', 'BATTLEFIELD', 'me', ['cFaceDown']);
    const hand = makeZone('hand-me', 'HAND', 'me', []);

    const card = { ...makeCard('cFaceDown', battlefield.id, 'me', false), faceDown: true };

    useGameStore.setState((state) => ({
      zones: { ...state.zones, [battlefield.id]: battlefield, [hand.id]: hand },
      cards: { ...state.cards, [card.id]: card },
    }));

    useGameStore.getState().moveCardToBottom(card.id, hand.id, 'me');

    const moved = useGameStore.getState().cards[card.id];
    expect(moved.zoneId).toBe(hand.id);
    expect(moved.faceDown).toBe(false);
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

  it('marks a card as known when entering a public zone face-up and keeps it when returning to hand', () => {
    const hand = makeZone('hand-me', 'HAND', 'me', ['cKnown']);
    const battlefield = makeZone('bf-me', 'BATTLEFIELD', 'me', []);
    const library = makeZone('lib-me', 'LIBRARY', 'me', []);

    const card = makeCard('cKnown', hand.id, 'me', false);

    useGameStore.setState((state) => ({
      zones: { ...state.zones, [hand.id]: hand, [battlefield.id]: battlefield, [library.id]: library },
      cards: { ...state.cards, [card.id]: card },
    }));

    useGameStore.getState().moveCard(card.id, battlefield.id, undefined, 'me');
    expect(useGameStore.getState().cards[card.id].knownToAll).toBe(true);

    useGameStore.getState().moveCard(card.id, hand.id, undefined, 'me');
    expect(useGameStore.getState().cards[card.id].knownToAll).toBe(true);

    // Entering library hides again.
    useGameStore.getState().moveCard(card.id, library.id, undefined, 'me');
    const inLibrary = useGameStore.getState().cards[card.id];
    expect(inLibrary.knownToAll).toBe(false);
    expect(inLibrary.revealedToAll).toBe(false);
    expect(inLibrary.revealedTo ?? []).toHaveLength(0);
  });

  it('clears reveal metadata when playing a card to the battlefield face-down', () => {
    const hand = makeZone('hand-me', 'HAND', 'me', ['cFD']);
    const battlefield = makeZone('bf-me', 'BATTLEFIELD', 'me', []);

    const card = { ...makeCard('cFD', hand.id, 'me', false), knownToAll: true, revealedToAll: true, revealedTo: ['opponent'] };

    useGameStore.setState((state) => ({
      zones: { ...state.zones, [hand.id]: hand, [battlefield.id]: battlefield },
      cards: { ...state.cards, [card.id]: card },
    }));

    useGameStore.getState().moveCard(card.id, battlefield.id, undefined, 'me', undefined, { faceDown: true });
    const moved = useGameStore.getState().cards[card.id];
    expect(moved.faceDown).toBe(true);
    expect(moved.knownToAll).toBe(false);
    expect(moved.revealedToAll).toBe(false);
    expect(moved.revealedTo ?? []).toHaveLength(0);
  });


  it('caps revealedTo recipients locally to avoid divergence', () => {
    const hand = makeZone('hand-me', 'HAND', 'me', ['cR']);
    const card = {
      ...makeCard('cR', hand.id, 'me', false),
      revealedToAll: false,
      revealedTo: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'],
    };

    useGameStore.setState((state) => ({
      zones: { ...state.zones, [hand.id]: hand },
      cards: { ...state.cards, [card.id]: card },
    }));

    useGameStore.getState().setCardReveal(card.id, { to: ['p9', 'p10', 'p11'] }, 'me');
    const updated = useGameStore.getState().cards[card.id];
    expect((updated.revealedTo ?? []).length).toBeLessThanOrEqual(8);
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


  it('duplicates a battlefield card as a token and preserves its state', () => {
    const battlefield = makeZone('bf-me', 'BATTLEFIELD', 'me', ['c9']);
    const card = {
      ...makeCard('c9', battlefield.id, 'me', true),
      counters: [{ type: '+1/+1', count: 2, color: '#fff' }],
      power: '5',
      toughness: '6',
      basePower: '4',
      baseToughness: '5',
      position: { x: 0.1, y: 0.2 },
    };

    useGameStore.setState((state) => ({
      myPlayerId: 'me',
      zones: { ...state.zones, [battlefield.id]: battlefield },
      cards: { ...state.cards, [card.id]: card },
    }));

    useGameStore.getState().duplicateCard(card.id, 'me');

    const state = useGameStore.getState();
    const newIds = state.zones[battlefield.id].cardIds.filter((id) => id !== card.id);
    expect(newIds).toHaveLength(1);

    const clone = state.cards[newIds[0]];
    expect(clone).toBeDefined();
    if (!clone) throw new Error('Clone not created');

    expect(clone.isToken).toBe(true);
    expect(clone.counters).toEqual(card.counters);
    expect(clone.power).toBe(card.power);
    expect(clone.toughness).toBe(card.toughness);
    expect(clone.basePower).toBe(card.basePower);
    expect(clone.baseToughness).toBe(card.baseToughness);
    expect(clone.tapped).toBe(true);
    const { stepX, stepY } = getNormalizedGridSteps({ isTapped: true });
    expect(clone.position).toEqual({
      x: card.position.x + stepX,
      y: card.position.y + stepY,
    });
    expect(clone.ownerId).toBe(card.ownerId);
    expect(clone.controllerId).toBe(card.controllerId);
  });

  it('stacks duplicates to the next free grid slot if the first is occupied', () => {
    const battlefield = makeZone('bf-me', 'BATTLEFIELD', 'me', ['c11', 'c12']);
    const basePosition = { x: 0, y: 0 };
    const card = { ...makeCard('c11', battlefield.id, 'me'), position: basePosition };
    const occupied = { ...makeCard('c12', battlefield.id, 'me'), position: { x: GRID_STEP_X, y: GRID_STEP_Y } };

    useGameStore.setState((state) => ({
      myPlayerId: 'me',
      zones: { ...state.zones, [battlefield.id]: battlefield },
      cards: { ...state.cards, [card.id]: card, [occupied.id]: occupied },
    }));

    useGameStore.getState().duplicateCard(card.id, 'me');

    const state = useGameStore.getState();
    const newIds = state.zones[battlefield.id].cardIds.filter((id) => id !== card.id && id !== occupied.id);
    expect(newIds).toHaveLength(1);

    const clone = state.cards[newIds[0]];
    expect(clone.position).toEqual({
      x: basePosition.x + GRID_STEP_X * 2,
      y: basePosition.y + GRID_STEP_Y * 2,
    });
  });

  it('blocks duplication when the actor cannot create a token on the battlefield', () => {
    const battlefield = makeZone('bf-me', 'BATTLEFIELD', 'me', ['c10']);
    const card = makeCard('c10', battlefield.id, 'me', false);

    useGameStore.setState((state) => ({
      myPlayerId: 'me',
      zones: { ...state.zones, [battlefield.id]: battlefield },
      cards: { ...state.cards, [card.id]: card },
    }));

    useGameStore.getState().duplicateCard(card.id, 'opponent');

    const state = useGameStore.getState();
    expect(state.zones[battlefield.id].cardIds).toEqual([card.id]);
    expect(Object.keys(state.cards)).toEqual([card.id]);
  });

  it('keeps counters when moving within battlefields but strips when exiting', () => {
    const battlefield = makeZone('bf-me', 'BATTLEFIELD', 'me', ['c20']);
    const otherBattlefield = makeZone('bf-opp', 'BATTLEFIELD', 'opp', []);
    const exile = makeZone('ex-me', 'EXILE', 'me', []);
    const card = { ...makeCard('c20', battlefield.id, 'me'), counters: [{ type: 'charge', count: 1 }] };

    useGameStore.setState((state) => ({
      ...state,
      zones: { ...state.zones, [battlefield.id]: battlefield, [otherBattlefield.id]: otherBattlefield, [exile.id]: exile },
      cards: { ...state.cards, [card.id]: card },
      myPlayerId: 'me',
    }));

    useGameStore.getState().moveCard(card.id, otherBattlefield.id, undefined, 'me');
    expect(useGameStore.getState().cards[card.id].counters).toEqual(card.counters);

    useGameStore.getState().moveCard(card.id, exile.id, undefined, 'me');
    expect(useGameStore.getState().cards[card.id].counters).toEqual([]);
  });

  it('updates controller when a card moves between battlefields', () => {
    const myBattlefield = makeZone('bf-me', 'BATTLEFIELD', 'me', ['c30']);
    const oppBattlefield = makeZone('bf-opp', 'BATTLEFIELD', 'opp', []);
    const card = makeCard('c30', myBattlefield.id, 'me');

    useGameStore.setState((state) => ({
      ...state,
      zones: { ...state.zones, [myBattlefield.id]: myBattlefield, [oppBattlefield.id]: oppBattlefield },
      cards: { ...state.cards, [card.id]: card },
      myPlayerId: 'me',
    }));

    useGameStore.getState().moveCard(card.id, oppBattlefield.id, undefined, 'me');
    expect(useGameStore.getState().cards[card.id].controllerId).toBe('opp');

    useGameStore.getState().moveCard(card.id, myBattlefield.id, undefined, 'me');
    expect(useGameStore.getState().cards[card.id].controllerId).toBe('me');
  });
});
