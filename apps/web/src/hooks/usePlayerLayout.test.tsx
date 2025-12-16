import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { act } from 'react';
import { usePlayerLayout } from './usePlayerLayout';
import { useGameStore } from '../store/gameStore';

type ProbeValue = ReturnType<typeof usePlayerLayout>;

const resetStore = () => {
  act(() => {
    useGameStore.setState({
      players: {},
      playerOrder: [],
      cards: {},
      zones: {},
      battlefieldViewScale: {},
      sessionId: 'test-session',
      myPlayerId: 'me',
      playerIdsBySession: {},
      sessionVersions: {},
      positionFormat: 'normalized',
      globalCounters: {},
      activeModal: null,
      hasHydrated: true,
    });
  });
};

const createPlayer = (id: string, color?: string) => ({
  id,
  name: id.toUpperCase(),
  life: 40,
  color,
  counters: [],
  commanderDamage: {},
  commanderTax: 0,
});

const Probe: React.FC<{ onValue: (value: ProbeValue) => void }> = ({ onValue }) => {
  const value = usePlayerLayout();
  React.useEffect(() => {
    onValue(value);
  }, [value, onValue]);
  return null;
};

describe('usePlayerLayout', () => {
  beforeEach(() => {
    resetStore();
  });

  it('uses shared playerOrder for seat positions (split layout)', async () => {
    const pA = createPlayer('pA');
    const pB = createPlayer('pB');

    act(() => {
      useGameStore.setState((state) => ({
        ...state,
        players: { pA, pB },
        playerOrder: ['pB', 'pA'],
        myPlayerId: 'pA',
      }));
    });

    let result: ProbeValue | null = null;
    render(<Probe onValue={(v) => { result = v; }} />);

    await waitFor(() => {
      expect(result).not.toBeNull();
      expect(result?.layoutMode).toBe('split');
      const bottom = result?.slots.find((s) => s.position === 'bottom-left')?.player?.id;
      const top = result?.slots.find((s) => s.position === 'top-left')?.player?.id;
      expect(bottom).toBe('pA'); // me is always bottom
      expect(top).toBe('pB'); // other player after rotation
    });
  });

  it('falls back to sorted players when playerOrder is missing/invalid', async () => {
    const pA = createPlayer('pA');
    const pB = createPlayer('pB');

    act(() => {
      useGameStore.setState((state) => ({
        ...state,
        players: { pA, pB },
        playerOrder: ['pZ'], // invalid entry ignored
        myPlayerId: 'pA',
      }));
    });

    let result: ProbeValue | null = null;
    render(<Probe onValue={(v) => { result = v; }} />);

    await waitFor(() => {
      expect(result).not.toBeNull();
      expect(result?.layoutMode).toBe('split');
      const bottom = result?.slots.find((s) => s.position === 'bottom-left')?.player?.id;
      const top = result?.slots.find((s) => s.position === 'top-left')?.player?.id;
      expect(bottom).toBe('pA'); // alphabetical fallback
      expect(top).toBe('pB');
    });
  });

  it('rotates shared playerOrder so me is bottom-left (quadrant layout)', async () => {
    const p1 = createPlayer('p1');
    const p2 = createPlayer('p2');
    const p3 = createPlayer('p3');
    const p4 = createPlayer('p4');

    act(() => {
      useGameStore.setState((state) => ({
        ...state,
        players: { p1, p2, p3, p4 },
        playerOrder: ['p1', 'p2', 'p3', 'p4'],
        myPlayerId: 'p2',
      }));
    });

    let result: ProbeValue | null = null;
    render(<Probe onValue={(v) => { result = v; }} />);

    await waitFor(() => {
      expect(result).not.toBeNull();
      expect(result?.layoutMode).toBe('quadrant');
      const bl = result?.slots.find((s) => s.position === 'bottom-left')?.player?.id;
      const br = result?.slots.find((s) => s.position === 'bottom-right')?.player?.id;
      const tl = result?.slots.find((s) => s.position === 'top-left')?.player?.id;
      const tr = result?.slots.find((s) => s.position === 'top-right')?.player?.id;
      expect(bl).toBe('p2');
      expect(br).toBe('p1');
      expect(tl).toBe('p3');
      expect(tr).toBe('p4');
    });
  });

  it('uses player-assigned colors (not seat colors) after rotation', async () => {
    const p1 = createPlayer('p1', 'rose');
    const p2 = createPlayer('p2', 'sky');
    const p3 = createPlayer('p3', 'amber');
    const p4 = createPlayer('p4', 'violet');

    act(() => {
      useGameStore.setState((state) => ({
        ...state,
        players: { p1, p2, p3, p4 },
        playerOrder: ['p1', 'p2', 'p3', 'p4'],
        myPlayerId: 'p2',
      }));
    });

    let result: ProbeValue | null = null;
    render(<Probe onValue={(v) => { result = v; }} />);

    await waitFor(() => {
      expect(result).not.toBeNull();
      const bl = result?.slots.find((s) => s.position === 'bottom-left');
      const br = result?.slots.find((s) => s.position === 'bottom-right');
      const tl = result?.slots.find((s) => s.position === 'top-left');
      const tr = result?.slots.find((s) => s.position === 'top-right');

      expect(bl?.player?.id).toBe('p2');
      expect(bl?.color).toBe('sky');
      expect(br?.player?.id).toBe('p1');
      expect(br?.color).toBe('rose');
      expect(tl?.player?.id).toBe('p3');
      expect(tl?.color).toBe('amber');
      expect(tr?.player?.id).toBe('p4');
      expect(tr?.color).toBe('violet');
    });
  });

  it('assigns fallback colors per shared order (not per viewer seat)', async () => {
    const p1 = createPlayer('p1');
    const p2 = createPlayer('p2');
    const p3 = createPlayer('p3');
    const p4 = createPlayer('p4');

    act(() => {
      useGameStore.setState((state) => ({
        ...state,
        players: { p1, p2, p3, p4 },
        playerOrder: ['p1', 'p2', 'p3', 'p4'],
        myPlayerId: 'p2',
      }));
    });

    let result: ProbeValue | null = null;
    render(<Probe onValue={(v) => { result = v; }} />);

    await waitFor(() => {
      expect(result).not.toBeNull();
      const bl = result?.slots.find((s) => s.position === 'bottom-left');
      expect(bl?.player?.id).toBe('p2');
      // p2 is second in shared order -> violet, even though it's bottom-left for this viewer.
      expect(bl?.color).toBe('violet');
    });
  });
});
