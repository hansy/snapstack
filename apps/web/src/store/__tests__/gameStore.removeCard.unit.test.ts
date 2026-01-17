import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { useGameStore } from '../gameStore';
import { ZONE } from '@/constants/zones';
import { ensureLocalStorage } from '@test/utils/storage';

describe('gameStore removeCard', () => {
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

  it('removes a token for owner', () => {
    const battlefield = { id: 'bf-me', type: ZONE.BATTLEFIELD, ownerId: 'me', cardIds: ['t1'] as string[] };
    const token = { id: 't1', name: 'Token', ownerId: 'me', controllerId: 'me', zoneId: battlefield.id, tapped: false, faceDown: false, position: { x: 0, y: 0 }, rotation: 0, counters: [], isToken: true };

    useGameStore.setState((state) => ({
      ...state,
      zones: { [battlefield.id]: battlefield },
      cards: { [token.id]: token },
    }));

    useGameStore.getState().removeCard(token.id, 'me');

    const state = useGameStore.getState();
    expect(state.cards[token.id]).toBeUndefined();
    expect(state.zones[battlefield.id].cardIds).not.toContain(token.id);
  });

  it('denies removing non-tokens', () => {
    const battlefield = { id: 'bf-me', type: ZONE.BATTLEFIELD, ownerId: 'me', cardIds: ['c1'] as string[] };
    const card = { id: 'c1', name: 'Card', ownerId: 'me', controllerId: 'me', zoneId: battlefield.id, tapped: false, faceDown: false, position: { x: 0, y: 0 }, rotation: 0, counters: [] };

    useGameStore.setState((state) => ({
      ...state,
      zones: { [battlefield.id]: battlefield },
      cards: { [card.id]: card },
    }));

    useGameStore.getState().removeCard(card.id, 'me');

    const state = useGameStore.getState();
    expect(state.cards[card.id]).toBeDefined();
    expect(state.zones[battlefield.id].cardIds).toContain(card.id);
  });
});
