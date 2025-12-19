import { describe, expect, it } from 'vitest';

import { computeBattlefieldCardLayout } from '../battlefieldModel';

const createCard = (overrides: Partial<any> = {}) =>
  ({
    id: 'c1',
    name: 'Card',
    ownerId: 'p1',
    controllerId: 'p1',
    zoneId: 'z1',
    tapped: false,
    faceDown: false,
    position: { x: 0.5, y: 0.5 },
    rotation: 0,
    counters: [],
    ...overrides,
  }) as any;

describe('battlefieldModel', () => {
  it('computes left/top from normalized position', () => {
    const layout = computeBattlefieldCardLayout({
      card: createCard(),
      zoneOwnerId: 'p1',
      viewerPlayerId: 'p1',
      zoneWidth: 100,
      zoneHeight: 200,
      playerColors: {},
    });

    expect(layout.left).toBe(10);
    expect(layout.top).toBe(40);
  });

  it('mirrors Y when rendering for the viewer', () => {
    const layout = computeBattlefieldCardLayout({
      card: createCard({ position: { x: 0.5, y: 0.25 } }),
      zoneOwnerId: 'p1',
      viewerPlayerId: 'p1',
      zoneWidth: 100,
      zoneHeight: 200,
      mirrorForViewer: true,
      playerColors: {},
    });

    expect(layout.top).toBe(90);
  });

  it('highlights foreign-owned cards using the owner color', () => {
    const layout = computeBattlefieldCardLayout({
      card: createCard({ ownerId: 'p2' }),
      zoneOwnerId: 'p1',
      viewerPlayerId: 'p1',
      zoneWidth: 100,
      zoneHeight: 200,
      playerColors: { p2: 'red' },
    });

    expect(layout.highlightColor).toBe('red');
  });

  it('disables drag when the viewer is not the controller', () => {
    const layout = computeBattlefieldCardLayout({
      card: createCard({ controllerId: 'p2' }),
      zoneOwnerId: 'p1',
      viewerPlayerId: 'p1',
      zoneWidth: 100,
      zoneHeight: 200,
      playerColors: {},
    });

    expect(layout.disableDrag).toBe(true);
  });
});

