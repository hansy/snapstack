import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { ZoneViewerModal } from './ZoneViewerModal';
import { useGameStore } from '../../../store/gameStore';
import { ZONE } from '../../../constants/zones';

const buildZone = (id: string, type: keyof typeof ZONE, ownerId: string, cardIds: string[] = []) => ({
  id,
  type: ZONE[type],
  ownerId,
  cardIds,
});

const buildCard = (id: string, name: string, zoneId: string) => ({
  id,
  name,
  ownerId: 'me',
  controllerId: 'me',
  zoneId,
  tapped: false,
  faceDown: false,
  position: { x: 0, y: 0 },
  rotation: 0,
  counters: [],
});

describe('ZoneViewerModal', () => {
  beforeEach(() => {
    useGameStore.setState({
      zones: {},
      cards: {},
      players: {},
      myPlayerId: 'me',
    });
  });

  it('does not refill top X view when cards leave the library', async () => {
    const library = buildZone('lib-me', 'LIBRARY', 'me', ['c1', 'c2', 'c3', 'c4', 'c5']);
    const hand = buildZone('hand-me', 'HAND', 'me', []);

    act(() => {
      useGameStore.setState((state) => ({
        ...state,
        zones: { [library.id]: library, [hand.id]: hand },
        cards: {
          c1: buildCard('c1', 'Card1', library.id),
          c2: buildCard('c2', 'Card2', library.id),
          c3: buildCard('c3', 'Card3', library.id),
          c4: buildCard('c4', 'Card4', library.id),
          c5: buildCard('c5', 'Card5', library.id),
        },
      }));
    });

    render(
      <ZoneViewerModal
        isOpen
        onClose={vi.fn()}
        zoneId={library.id}
        count={3}
      />
    );

    expect(await screen.findByText('Card3')).toBeTruthy();
    expect(screen.getByText('Card4')).toBeTruthy();
    expect(screen.getByText('Card5')).toBeTruthy();
    expect(screen.queryByText('Card2')).toBeNull();

    act(() => {
      useGameStore.setState((state) => ({
        ...state,
        zones: {
          ...state.zones,
          [library.id]: { ...state.zones[library.id], cardIds: ['c1', 'c2', 'c3', 'c4'] },
          [hand.id]: { ...state.zones[hand.id], cardIds: ['c5'] },
        },
        cards: {
          ...state.cards,
          c5: { ...state.cards.c5, zoneId: hand.id },
        },
      }));
    });

    await waitFor(() => {
      expect(screen.queryByText('Card5')).toBeNull();
      expect(screen.getByText('Card3')).toBeTruthy();
      expect(screen.getByText('Card4')).toBeTruthy();
      expect(screen.queryByText('Card2')).toBeNull();
    });
  });
});
