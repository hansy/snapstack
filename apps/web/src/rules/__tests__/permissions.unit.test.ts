import { describe, it, expect } from 'vitest';
import { canMoveCard, canViewZone, canCreateToken, canUpdatePlayer, canModifyCardState, canTapCard } from '../permissions';
import { ZONE } from '@/constants/zones';
import { Card, Zone, Player } from '@/types';

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

  it('blocks spectators from viewing libraries but allows public zones', () => {
    const library = makeZone('lib-owner', ZONE.LIBRARY, 'owner');
    const graveyard = makeZone('gy-owner', ZONE.GRAVEYARD, 'owner');
    expect(canViewZone({ actorId: 'spec', role: 'spectator' }, library).allowed).toBe(false);
    expect(canViewZone({ actorId: 'spec', role: 'spectator' }, graveyard).allowed).toBe(true);
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
    ).toBe(false);
  });

  it('allows tokens to move between battlefields under the same rules', () => {
    const token = makeCard({ ownerId: 'owner', zoneId: 'bf-owner', isToken: true });
    const fromZone = makeZone('bf-owner', ZONE.BATTLEFIELD, 'owner');
    const toZone = makeZone('bf-ally', ZONE.BATTLEFIELD, 'ally');

    expect(
      canMoveCard({ actorId: 'owner', card: token, fromZone, toZone }).allowed
    ).toBe(true);
    const controlledToken = { ...token, controllerId: 'ally' };
    expect(
      canMoveCard({ actorId: 'ally', card: controlledToken, fromZone, toZone }).allowed
    ).toBe(true);
  });

  it('allows host to move a foreign card on their battlefield', () => {
    const card = makeCard({ ownerId: 'owner', zoneId: 'bf-host' });
    const fromZone = makeZone('bf-host', ZONE.BATTLEFIELD, 'host');
    const toZone = makeZone('bf-host', ZONE.BATTLEFIELD, 'host');

    expect(
      canMoveCard({ actorId: 'host', card, fromZone, toZone }).allowed
    ).toBe(false);
  });

  it('allows a controller to move a foreign card on their battlefield', () => {
    const card = makeCard({ ownerId: 'owner', controllerId: 'host', zoneId: 'bf-host' });
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

  it('allows only the card owner to move a card into their own hand', () => {
    const card = makeCard({ ownerId: 'owner', zoneId: 'bf-owner' });
    const fromZone = makeZone('bf-owner', ZONE.BATTLEFIELD, 'owner');
    const toZone = makeZone('hand-owner', ZONE.HAND, 'owner');

    expect(
      canMoveCard({ actorId: 'owner', card, fromZone, toZone }).allowed
    ).toBe(true);
    expect(
      canMoveCard({ actorId: 'opponent', card, fromZone, toZone }).allowed
    ).toBe(false);
  });

  it('blocks placing a card into another player\'s seat zone', () => {
    const card = makeCard({ ownerId: 'owner', zoneId: 'bf-owner' });
    const fromZone = makeZone('bf-owner', ZONE.BATTLEFIELD, 'owner');
    const toZone = makeZone('gy-opponent', ZONE.GRAVEYARD, 'opponent');

    expect(
      canMoveCard({ actorId: 'owner', card, fromZone, toZone }).allowed
    ).toBe(false);
    expect(
      canMoveCard({ actorId: 'opponent', card, fromZone, toZone }).allowed
    ).toBe(false);
  });

  it('blocks spectators from moving cards', () => {
    const card = makeCard({ ownerId: 'owner', zoneId: 'bf-owner' });
    const fromZone = makeZone('bf-owner', ZONE.BATTLEFIELD, 'owner');
    const toZone = makeZone('bf-owner', ZONE.BATTLEFIELD, 'owner');

    expect(
      canMoveCard({ actorId: 'spec', role: 'spectator', card, fromZone, toZone }).allowed
    ).toBe(false);
  });
});

describe('canModifyCardState', () => {
  it('allows controller on battlefield to modify', () => {
    const battlefield = makeZone('bf', ZONE.BATTLEFIELD, 'p1');
    const card = makeCard({ ownerId: 'owner', controllerId: 'p1', zoneId: battlefield.id });
    expect(canModifyCardState({ actorId: 'p1' }, card, battlefield).allowed).toBe(true);
  });

  it('blocks non-controller from modifying', () => {
    const battlefield = makeZone('bf', ZONE.BATTLEFIELD, 'p1');
    const card = makeCard({ ownerId: 'owner', controllerId: 'owner', zoneId: battlefield.id });
    expect(canModifyCardState({ actorId: 'stranger' }, card, battlefield).allowed).toBe(false);
  });

  it('blocks modification outside the battlefield', () => {
    const graveyard = makeZone('gy', ZONE.GRAVEYARD, 'owner');
    const card = makeCard({ zoneId: graveyard.id });
    expect(canModifyCardState({ actorId: 'owner' }, card, graveyard).allowed).toBe(false);
  });

  it('blocks spectators from modifying cards', () => {
    const battlefield = makeZone('bf', ZONE.BATTLEFIELD, 'p1');
    const card = makeCard({ ownerId: 'owner', controllerId: 'p1', zoneId: battlefield.id });
    expect(
      canModifyCardState({ actorId: 'spec', role: 'spectator' }, card, battlefield).allowed
    ).toBe(false);
  });
});

describe('canTapCard', () => {
  it('allows the controller to tap on the battlefield', () => {
    const battlefield = makeZone('bf', ZONE.BATTLEFIELD, 'owner');
    const card = makeCard({ ownerId: 'owner', controllerId: 'owner', zoneId: battlefield.id });
    expect(canTapCard({ actorId: 'owner' }, card, battlefield).allowed).toBe(true);
  });

  it('denies tapping outside the battlefield', () => {
    const hand = makeZone('hand', ZONE.HAND, 'owner');
    const card = makeCard({ ownerId: 'owner', controllerId: 'owner', zoneId: hand.id });
    expect(canTapCard({ actorId: 'owner' }, card, hand).allowed).toBe(false);
  });

  it('blocks spectators from tapping cards', () => {
    const battlefield = makeZone('bf', ZONE.BATTLEFIELD, 'owner');
    const card = makeCard({ ownerId: 'owner', controllerId: 'owner', zoneId: battlefield.id });
    expect(
      canTapCard({ actorId: 'spec', role: 'spectator' }, card, battlefield).allowed
    ).toBe(false);
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

  it('blocks spectators from creating tokens', () => {
    const battlefield = makeZone('bf-owner', ZONE.BATTLEFIELD, 'owner');
    expect(canCreateToken({ actorId: 'spec', role: 'spectator' }, battlefield).allowed).toBe(false);
  });
});

describe('canUpdatePlayer', () => {
  const player: Player = { id: 'p1', life: 40, commanderDamage: {}, counters: [], name: 'P1', commanderTax: 0 };

  it('allows a player to change their own life total', () => {
    expect(canUpdatePlayer({ actorId: 'p1' }, player, { life: 39 }).allowed).toBe(true);
  });

  it('blocks changing another player life total', () => {
    const result = canUpdatePlayer({ actorId: 'p2' }, player, { life: 39 });
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toContain('life');
    }
  });

  it('blocks spectators from updating players', () => {
    const result = canUpdatePlayer(
      { actorId: 'spec', role: 'spectator' },
      player,
      { life: 39 }
    );
    expect(result.allowed).toBe(false);
  });
});
