import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { useGameStore } from '../gameStore';
import { ZONE } from '@/constants/zones';
import { ensureLocalStorage } from '../testUtils';

describe('gameStore counter actions', () => {
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
      globalCounters: {},
      activeModal: null,
    });
  });

  it('adds a global counter type (with provided color)', () => {
    useGameStore.getState().addGlobalCounter(' +1/+1 ', '#ff0000');

    const state = useGameStore.getState();
    expect(state.globalCounters['+1/+1']).toBe('#ff0000');

    useGameStore.getState().addGlobalCounter('+1/+1', '#00ff00');
    expect(useGameStore.getState().globalCounters['+1/+1']).toBe('#ff0000');
  });

  it('adds and removes counters on battlefield cards', () => {
    const battlefield = { id: 'bf-me', type: ZONE.BATTLEFIELD, ownerId: 'me', cardIds: ['c1'] as string[] };
    const card = {
      id: 'c1',
      name: 'Card',
      ownerId: 'me',
      controllerId: 'me',
      zoneId: battlefield.id,
      tapped: false,
      faceDown: false,
      position: { x: 0, y: 0 },
      rotation: 0,
      counters: [],
    };

    useGameStore.setState((state) => ({
      ...state,
      zones: { [battlefield.id]: battlefield },
      cards: { [card.id]: card },
    }));

    useGameStore.getState().addCounterToCard(card.id, { type: '+1/+1', count: 2 }, 'me');
    expect(useGameStore.getState().cards[card.id].counters).toEqual([{ type: '+1/+1', count: 2 }]);

    useGameStore.getState().addCounterToCard(card.id, { type: '+1/+1', count: 1 }, 'me');
    expect(useGameStore.getState().cards[card.id].counters).toEqual([{ type: '+1/+1', count: 3 }]);

    useGameStore.getState().removeCounterFromCard(card.id, '+1/+1', 'me');
    expect(useGameStore.getState().cards[card.id].counters).toEqual([{ type: '+1/+1', count: 2 }]);

    useGameStore.getState().removeCounterFromCard(card.id, '+1/+1', 'me');
    useGameStore.getState().removeCounterFromCard(card.id, '+1/+1', 'me');
    expect(useGameStore.getState().cards[card.id].counters).toEqual([]);
  });

});
