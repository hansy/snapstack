import { describe, expect, it } from 'vitest';

import * as shared from '@mtg/shared/rules/permissions';
import * as web from '@/rules/permissions';
import { ZONE } from '@/constants/zones';
import type { Card, Player, Zone } from '@/types';

const makeCard = (overrides: Partial<Card> = {}): Card => ({
  id: overrides.id ?? 'card-1',
  name: overrides.name ?? 'Test Card',
  ownerId: overrides.ownerId ?? 'owner',
  controllerId: overrides.controllerId ?? overrides.ownerId ?? 'owner',
  zoneId: overrides.zoneId ?? 'zone-owner-bf',
  tapped: overrides.tapped ?? false,
  faceDown: overrides.faceDown ?? false,
  position: overrides.position ?? { x: 0, y: 0 },
  rotation: overrides.rotation ?? 0,
  counters: overrides.counters ?? [],
  ...overrides,
});

const makeZone = (id: string, type: Zone['type'], ownerId: string, cardIds: string[] = ['card-1']): Zone => ({
  id,
  type,
  ownerId,
  cardIds,
});

const makePlayer = (overrides: Partial<Player> = {}): Player => ({
  id: overrides.id ?? 'p1',
  name: overrides.name ?? 'Player',
  life: overrides.life ?? 40,
  counters: overrides.counters ?? [],
  commanderDamage: overrides.commanderDamage ?? {},
  commanderTax: overrides.commanderTax ?? 0,
  ...overrides,
});

describe('permissions parity', () => {
  it('matches canViewZone decisions', () => {
    const library = makeZone('lib-owner', ZONE.LIBRARY, 'owner');
    const ctx = { actorId: 'owner' };

    expect(web.canViewZone(ctx, library)).toEqual(shared.canViewZone(ctx, library));
  });

  it('matches canMoveCard decisions', () => {
    const card = makeCard({ ownerId: 'owner', controllerId: 'owner' });
    const fromZone = makeZone('bf-owner', ZONE.BATTLEFIELD, 'owner');
    const toZone = makeZone('hand-owner', ZONE.HAND, 'owner');
    const ctx = { actorId: 'owner', card, fromZone, toZone };

    expect(web.canMoveCard(ctx)).toEqual(shared.canMoveCard(ctx));
  });

  it('matches canTapCard decisions', () => {
    const card = makeCard({ controllerId: 'owner' });
    const zone = makeZone('bf', ZONE.BATTLEFIELD, 'owner');
    const ctx = { actorId: 'owner' };

    expect(web.canTapCard(ctx, card, zone)).toEqual(shared.canTapCard(ctx, card, zone));
  });

  it('matches canModifyCardState decisions', () => {
    const card = makeCard({ controllerId: 'owner' });
    const zone = makeZone('bf', ZONE.BATTLEFIELD, 'owner');
    const ctx = { actorId: 'stranger' };

    expect(web.canModifyCardState(ctx, card, zone)).toEqual(
      shared.canModifyCardState(ctx, card, zone)
    );
  });

  it('matches canCreateToken decisions', () => {
    const zone = makeZone('bf-owner', ZONE.BATTLEFIELD, 'owner');
    const ctx = { actorId: 'owner' };

    expect(web.canCreateToken(ctx, zone)).toEqual(shared.canCreateToken(ctx, zone));
  });

  it('matches canUpdatePlayer decisions', () => {
    const player = makePlayer({ id: 'p1' });
    const ctx = { actorId: 'p1' };
    const updates = { life: 39 };

    expect(web.canUpdatePlayer(ctx, player, updates)).toEqual(
      shared.canUpdatePlayer(ctx, player, updates)
    );
  });
});
