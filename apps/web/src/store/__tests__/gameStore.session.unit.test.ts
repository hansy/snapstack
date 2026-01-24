import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { sendIntent } from '@/partykit/intentTransport';
import { useGameStore } from '../gameStore';
import { ensureLocalStorage } from '@test/utils/storage';

vi.mock('@/partykit/intentTransport', () => ({
  sendIntent: vi.fn(),
  clearIntentTransport: vi.fn(),
  getIntentConnectionMeta: vi.fn(() => ({
    isOpen: false,
    everConnected: true,
    lastOpenAt: null,
    lastCloseAt: 0,
  })),
}));

const sendIntentMock = vi.mocked(sendIntent);

describe('gameStore session actions', () => {
  beforeAll(() => {
    ensureLocalStorage();
  });

  beforeEach(() => {
    localStorage.clear();
    sendIntentMock.mockClear();
    sendIntentMock.mockReturnValue(true);
    useGameStore.setState({
      players: {},
      playerOrder: [],
      cards: {},
      zones: {},
      battlefieldViewScale: {},
      globalCounters: {},
      activeModal: null,
      sessionId: 's0',
      myPlayerId: 'p0',
      playerIdsBySession: {},
      sessionVersions: {},
      hasHydrated: false,
    });
  });

  it('resetSession clears game state and increments the session version', () => {
    useGameStore.setState({
      players: { p0: { id: 'p0', name: 'Me', life: 40, counters: [], commanderDamage: {}, commanderTax: 0 } },
      cards: { c1: { id: 'c1', name: 'Card', ownerId: 'p0', controllerId: 'p0', zoneId: 'z1', tapped: false, faceDown: false, position: { x: 0, y: 0 }, rotation: 0, counters: [] } },
      zones: { z1: { id: 'z1', type: 'battlefield', ownerId: 'p0', cardIds: ['c1'] } },
      playerIdsBySession: { s1: 'old' },
      sessionVersions: { s1: 2 },
    });

    useGameStore.getState().resetSession('s1', 'p1');

    const state = useGameStore.getState();
    expect(state.sessionId).toBe('s1');
    expect(state.myPlayerId).toBe('p1');
    expect(state.players).toEqual({});
    expect(state.cards).toEqual({});
    expect(state.zones).toEqual({});
    expect(state.battlefieldViewScale).toEqual({});
    expect(state.playerIdsBySession.s1).toBe('p1');
    expect(state.sessionVersions.s1).toBe(3);
  });

  it('ensurePlayerIdForSession returns a stable id per session', () => {
    const first = useGameStore.getState().ensurePlayerIdForSession('s2');
    expect(typeof first).toBe('string');
    expect(first.length).toBeGreaterThan(0);
    expect(useGameStore.getState().playerIdsBySession.s2).toBe(first);

    const second = useGameStore.getState().ensurePlayerIdForSession('s2');
    expect(second).toBe(first);
  });

  it('forgetSessionIdentity removes mapping and bumps version', () => {
    useGameStore.setState({
      playerIdsBySession: { s3: 'p3' },
      sessionVersions: { s3: 1 },
    });

    useGameStore.getState().forgetSessionIdentity('s3');

    const state = useGameStore.getState();
    expect(state.playerIdsBySession.s3).toBeUndefined();
    expect(state.sessionVersions.s3).toBe(2);
  });

  it('ensureSessionVersion initializes missing versions', () => {
    expect(useGameStore.getState().ensureSessionVersion('s4')).toBe(1);
    expect(useGameStore.getState().sessionVersions.s4).toBe(1);

    useGameStore.setState({ sessionVersions: { s4: 5 } });
    expect(useGameStore.getState().ensureSessionVersion('s4')).toBe(5);
  });

  it('leaveGame forgets identity for current session and resets game state', () => {
    useGameStore.setState({
      sessionId: 's5',
      myPlayerId: 'p5',
      playerIdsBySession: { s5: 'p5' },
      sessionVersions: { s5: 0 },
      players: { p5: { id: 'p5', name: 'Me', life: 40, counters: [], commanderDamage: {}, commanderTax: 0 } },
    });

    useGameStore.getState().leaveGame();

    const state = useGameStore.getState();
    expect(sendIntentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'player.leave',
        payload: { playerId: 'p5', actorId: 'p5' },
      })
    );
    expect(state.playerIdsBySession.s5).toBeUndefined();
    expect(state.sessionVersions.s5).toBe(1);
    expect(state.players).toEqual({});
    expect(state.cards).toEqual({});
    expect(state.zones).toEqual({});
    expect(typeof state.sessionId).toBe('string');
    expect(state.sessionId.length).toBeGreaterThan(0);
    expect(typeof state.myPlayerId).toBe('string');
    expect(state.myPlayerId.length).toBeGreaterThan(0);
  });

  it('setDeckLoaded includes actorId in deck intents', () => {
    useGameStore.setState({
      myPlayerId: 'p7',
      players: {
        p7: {
          id: 'p7',
          name: 'Me',
          life: 40,
          counters: [],
          commanderDamage: {},
          commanderTax: 0,
        },
      },
    });

    useGameStore.getState().setDeckLoaded('p7', true);

    expect(sendIntentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'deck.load',
        payload: { playerId: 'p7', actorId: 'p7' },
      })
    );
  });

  it('setDeckLoaded includes actorId in unload intents', () => {
    useGameStore.setState({
      myPlayerId: 'p8',
      players: {
        p8: {
          id: 'p8',
          name: 'Me',
          life: 40,
          counters: [],
          commanderDamage: {},
          commanderTax: 0,
        },
      },
    });

    useGameStore.getState().setDeckLoaded('p8', false);

    expect(sendIntentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'deck.unload',
        payload: { playerId: 'p8', actorId: 'p8' },
      })
    );
  });

  it('setHasHydrated toggles hydration state', () => {
    expect(useGameStore.getState().hasHydrated).toBe(false);
    useGameStore.getState().setHasHydrated(true);
    expect(useGameStore.getState().hasHydrated).toBe(true);
  });
});
