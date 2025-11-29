import { describe, it, expect } from 'vitest';
import { canMoveCard, canViewZone, canCreateToken, canUpdatePlayer } from './permissions';
import { ZONE } from '../constants/zones';
import { Card, Zone, Player } from '../types';

const makeCard = (overrides: Partial<Card> = {}): Card => ({
  id: 'card-1',
  name: 'Test Card',
  ownerId: 'owner',
  controllerId: 'owner',
  zoneId: 'zone-owner-bf',
  tapped: false,
  faceDown: false,
  position: { x: 0, y: 0 },
  rotation: 0,
  counters: [],
  ...overrides,
});

const makeZone = (id: string, type: Zone['type'], ownerId: string, cardIds: string[] = ['card-1']): Zone => ({
  id,
  type,
  ownerId,
  cardIds,
});

describe('canViewZone', () => {
  it('allows only owner to view library', () => {
    const library = makeZone('lib-owner', ZONE.LIBRARY, 'owner');
    expect(canViewZone({ actorId: 'owner' }, library)).toMatchObject({ allowed: true });
    expect(canViewZone({ actorId: 'opponent' }, library).allowed).toBe(false);
  });

  it('allows everyone to view public zones', () => {
    const graveyard = makeZone('gy-owner', ZONE.GRAVEYARD, 'owner');
    expect(canViewZone({ actorId: 'owner' }, graveyard).allowed).toBe(true);
    expect(canViewZone({ actorId: 'opponent' }, graveyard).allowed).toBe(true);
  });
});

describe('canMoveCard', () => {
  it('allows owner to move their card between any battlefields', () => {
    const card = makeCard({ ownerId: 'owner', zoneId: 'bf-owner' });
    const fromZone = makeZone('bf-owner', ZONE.BATTLEFIELD, 'owner');
    const toZone = makeZone('bf-opponent', ZONE.BATTLEFIELD, 'opponent');

    expect(
      canMoveCard({ actorId: 'owner', card, fromZone, toZone }).allowed
    ).toBe(true);
  });

  it('prevents placing cards into another players commander zone', () => {
    const card = makeCard({ ownerId: 'owner', zoneId: 'bf-owner' });
    const fromZone = makeZone('bf-owner', ZONE.BATTLEFIELD, 'owner');
    const toZone = makeZone('commander-opponent', ZONE.COMMANDER, 'opponent');

    expect(
      canMoveCard({ actorId: 'owner', card, fromZone, toZone }).allowed
    ).toBe(false);
    expect(
      canMoveCard({ actorId: 'opponent', card, fromZone, toZone }).allowed
    ).toBe(true);
  });

  it('allows tokens to move between battlefields under the same rules', () => {
    const token = makeCard({ ownerId: 'owner', zoneId: 'bf-owner', isToken: true });
    const fromZone = makeZone('bf-owner', ZONE.BATTLEFIELD, 'owner');
    const toZone = makeZone('bf-ally', ZONE.BATTLEFIELD, 'ally');

    expect(
      canMoveCard({ actorId: 'owner', card: token, fromZone, toZone }).allowed
    ).toBe(true);
    expect(
      canMoveCard({ actorId: 'ally', card: token, fromZone, toZone }).allowed
    ).toBe(true);
  });

  it('allows host to move a foreign card on their battlefield', () => {
    const card = makeCard({ ownerId: 'owner', zoneId: 'bf-host' });
    const fromZone = makeZone('bf-host', ZONE.BATTLEFIELD, 'host');
    const toZone = makeZone('bf-host', ZONE.BATTLEFIELD, 'host');

    expect(
      canMoveCard({ actorId: 'host', card, fromZone, toZone }).allowed
    ).toBe(true);
  });

  it('denies a third party from moving a card between battlefields they neither own nor host', () => {
    const card = makeCard({ ownerId: 'owner', zoneId: 'bf-host' });
    const fromZone = makeZone('bf-host', ZONE.BATTLEFIELD, 'host');
    const toZone = makeZone('bf-owner', ZONE.BATTLEFIELD, 'owner');

    expect(
      canMoveCard({ actorId: 'stranger', card, fromZone, toZone }).allowed
    ).toBe(false);
  });

  it('requires owner of hidden zone to move out of it', () => {
    const card = makeCard({ ownerId: 'owner', zoneId: 'lib-owner' });
    const fromZone = makeZone('lib-owner', ZONE.LIBRARY, 'owner');
    const toZone = makeZone('bf-owner', ZONE.BATTLEFIELD, 'owner');

    expect(
      canMoveCard({ actorId: 'owner', card, fromZone, toZone }).allowed
    ).toBe(true);
    expect(
      canMoveCard({ actorId: 'opponent', card, fromZone, toZone }).allowed
    ).toBe(false);
  });

  it('requires destination hidden zone owner to receive cards', () => {
    const card = makeCard({ ownerId: 'owner', zoneId: 'bf-owner' });
    const fromZone = makeZone('bf-owner', ZONE.BATTLEFIELD, 'owner');
    const toZone = makeZone('hand-opponent', ZONE.HAND, 'opponent');

    expect(
      canMoveCard({ actorId: 'owner', card, fromZone, toZone }).allowed
    ).toBe(false);
    expect(
      canMoveCard({ actorId: 'opponent', card, fromZone, toZone }).allowed
    ).toBe(true);
  });
});

describe('canCreateToken', () => {
  it('allows the battlefield owner to create a token', () => {
    const battlefield = makeZone('bf-owner', ZONE.BATTLEFIELD, 'owner');
    expect(canCreateToken({ actorId: 'owner' }, battlefield).allowed).toBe(true);
  });

  it("denies non-owners from creating a token on someone else's battlefield", () => {
    const battlefield = makeZone('bf-owner', ZONE.BATTLEFIELD, 'owner');
    expect(canCreateToken({ actorId: 'opponent' }, battlefield)).toMatchObject({
      allowed: false,
      reason: expect.stringContaining('Only zone owner'),
    });
  });

  it('denies token creation in non-battlefield zones even for owner', () => {
    const hand = makeZone('hand-owner', ZONE.HAND, 'owner');
    expect(canCreateToken({ actorId: 'owner' }, hand)).toMatchObject({
      allowed: false,
      reason: expect.stringContaining('battlefield'),
    });
  });
});

describe('canUpdatePlayer', () => {
  const player: Player = { id: 'p1', life: 40, commanderDamage: {}, counters: [], name: 'P1' };

  it('allows a player to change their own life total', () => {
    expect(canUpdatePlayer({ actorId: 'p1' }, player, { life: 39 }).allowed).toBe(true);
  });

  it('blocks changing another player life total', () => {
    const result = canUpdatePlayer({ actorId: 'p2' }, player, { life: 39 });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('life');
  });
});
