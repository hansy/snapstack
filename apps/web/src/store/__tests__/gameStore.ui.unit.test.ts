import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { useGameStore } from '../gameStore';
import { ensureLocalStorage } from '@test/utils/storage';

describe('gameStore ui actions', () => {
  beforeAll(() => {
    ensureLocalStorage();
  });

  beforeEach(() => {
    localStorage.clear();
    useGameStore.setState({
      battlefieldViewScale: {},
      battlefieldGridSizing: {},
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

  it('setBattlefieldGridSizing stores and clears sizing per player', () => {
    useGameStore.getState().setBattlefieldGridSizing('me', {
      zoneHeightPx: 600,
      baseCardHeightPx: 160,
      baseCardWidthPx: 106.6667,
      viewScale: 0.9,
    });

    expect(useGameStore.getState().battlefieldGridSizing.me).toEqual({
      zoneHeightPx: 600,
      baseCardHeightPx: 160,
      baseCardWidthPx: 106.6667,
      viewScale: 0.9,
    });

    useGameStore.getState().setBattlefieldGridSizing('me', null);
    expect(useGameStore.getState().battlefieldGridSizing.me).toBeUndefined();
  });
});
