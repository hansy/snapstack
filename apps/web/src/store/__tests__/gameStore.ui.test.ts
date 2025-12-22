import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { useGameStore } from '../gameStore';
import { ensureLocalStorage } from '../testUtils';

describe('gameStore ui actions', () => {
  beforeAll(() => {
    ensureLocalStorage();
  });

  beforeEach(() => {
    localStorage.clear();
    useGameStore.setState({
      battlefieldViewScale: {},
      activeModal: null,
      myPlayerId: 'me',
    });
  });

  it('setActiveModal stores modal state', () => {
    useGameStore.getState().setActiveModal({ type: 'ADD_COUNTER', cardIds: ['c1'] });
    expect(useGameStore.getState().activeModal).toEqual({ type: 'ADD_COUNTER', cardIds: ['c1'] });

    useGameStore.getState().setActiveModal(null);
    expect(useGameStore.getState().activeModal).toBeNull();
  });

  it('setBattlefieldViewScale clamps and updates per player', () => {
    useGameStore.getState().setBattlefieldViewScale('me', 0.1);
    expect(useGameStore.getState().battlefieldViewScale.me).toBe(0.5);

    useGameStore.getState().setBattlefieldViewScale('me', 2);
    expect(useGameStore.getState().battlefieldViewScale.me).toBe(1);

    useGameStore.getState().setBattlefieldViewScale('me', 0.8);
    expect(useGameStore.getState().battlefieldViewScale.me).toBe(0.8);
  });
});
