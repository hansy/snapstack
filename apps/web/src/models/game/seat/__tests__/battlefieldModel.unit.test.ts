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
      mirrorBattlefieldY: false,
      playerColors: {},
    });

    expect(layout.left).toBe(10);
    expect(layout.top).toBe(40);
  });

  it('uses a custom base card height when provided', () => {
    const layout = computeBattlefieldCardLayout({
      card: createCard(),
      zoneOwnerId: 'p1',
      viewerPlayerId: 'p1',
      zoneWidth: 100,
      zoneHeight: 200,
      mirrorBattlefieldY: false,
      playerColors: {},
      baseCardHeight: 160,
    });

    expect(layout.left).toBeCloseTo(-3.3333, 3);
    expect(layout.top).toBeCloseTo(20, 6);
  });

  it('mirrors Y when rendering for a mirrored seat', () => {
    const layout = computeBattlefieldCardLayout({
      card: createCard({ position: { x: 0.5, y: 0.25 } }),
      zoneOwnerId: 'p1',
      viewerPlayerId: 'p1',
      zoneWidth: 100,
      zoneHeight: 200,
      mirrorBattlefieldY: true,
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
      mirrorBattlefieldY: false,
      playerColors: { p2: 'red' },
    });

    expect(layout.highlightColor).toBe('red');
  });

  it('disables drag when the viewer is not the controller', () => {
    const layout = computeBattlefieldCardLayout({
      card: createCard({ ownerId: 'p2', controllerId: 'p3' }),
      zoneOwnerId: 'p1',
      viewerPlayerId: 'p1',
      zoneWidth: 100,
      zoneHeight: 200,
      mirrorBattlefieldY: false,
      playerColors: {},
    });

    expect(layout.disableDrag).toBe(true);
  });

  it('allows drag for the owner even when another player controls the card', () => {
    const layout = computeBattlefieldCardLayout({
      card: createCard({ ownerId: 'p1', controllerId: 'p2' }),
      zoneOwnerId: 'p2',
      viewerPlayerId: 'p1',
      zoneWidth: 100,
      zoneHeight: 200,
      mirrorBattlefieldY: false,
      playerColors: {},
    });

    expect(layout.disableDrag).toBe(false);
  });
});
