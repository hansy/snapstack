import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { useGameStore } from '../gameStore';
import { ensureLocalStorage } from '../testUtils';

describe('gameStore updatePlayer permissions', () => {
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

  it('allows a player to change their own life total', () => {
    useGameStore.setState((state) => ({
      ...state,
      players: { me: { id: 'me', name: 'Me', life: 40, counters: [], commanderDamage: {}, commanderTax: 0 } },
    }));

    useGameStore.getState().updatePlayer('me', { life: 39 }, 'me');

    expect(useGameStore.getState().players.me.life).toBe(39);
  });

  it('blocks changing another player life total', () => {
    useGameStore.setState((state) => ({
      ...state,
      players: {
        me: { id: 'me', name: 'Me', life: 40, counters: [], commanderDamage: {}, commanderTax: 0 },
        opponent: { id: 'opponent', name: 'Opponent', life: 40, counters: [], commanderDamage: {}, commanderTax: 0 },
      },
    }));

    useGameStore.getState().updatePlayer('opponent', { life: 35 }, 'me');

    expect(useGameStore.getState().players.opponent.life).toBe(40);
  });

  it('blocks changing another player name', () => {
    useGameStore.setState((state) => ({
      ...state,
      players: {
        me: { id: 'me', name: 'Me', life: 40, counters: [], commanderDamage: {}, commanderTax: 0 },
        opponent: { id: 'opponent', name: 'Opponent', life: 40, counters: [], commanderDamage: {}, commanderTax: 0 },
      },
    }));

    useGameStore.getState().updatePlayer('opponent', { name: 'Hacked' }, 'me');

    expect(useGameStore.getState().players.opponent.name).toBe('Opponent');
  });
});
