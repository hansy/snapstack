import { ZONE } from '../constants/zones';
import { ZoneType, isTokenCard, Player } from '../types';
import { ActorContext, MoveContext, PermissionResult, ViewResult } from './types';

const HIDDEN_ZONES = new Set<ZoneType>([ZONE.LIBRARY, ZONE.HAND]);

const isHiddenZone = (zoneType: ZoneType) => HIDDEN_ZONES.has(zoneType);
const requireBattlefieldController = (
  ctx: ActorContext,
  card: { controllerId: string },
  zone: { type: ZoneType } | undefined,
  action: string
): PermissionResult => {
  if (!zone || zone.type !== ZONE.BATTLEFIELD) {
    return { allowed: false, reason: `Cards can only ${action} on the battlefield` };
  }
  const isController = ctx.actorId === card.controllerId;
  return isController ? { allowed: true } : { allowed: false, reason: `Only controller may ${action}` };
};

/**
 * Who can see what in a zone.
 * - Hidden zones (library, hand): only zone owner; library "view all" is owner-only.
 * - Public zones: everyone sees faces.
 */
export function canViewZone(
  ctx: ActorContext,
  zone: { ownerId: string; type: ZoneType },
  _opts: { viewAll?: boolean } = {}
): ViewResult {
  const isOwner = ctx.actorId === zone.ownerId;

  if (isHiddenZone(zone.type)) {
    if (!isOwner) return { allowed: false, reason: 'Hidden zone' };
    // Library "view all" is implicitly owner-only; already satisfied by isOwner.
    return { allowed: true, visibility: 'faces' };
  }

  return { allowed: true, visibility: 'faces' };
}

/**
 * Card movement permissions.
 * Battlefield rules:
 * - Card owner can move their card to any battlefield.
 * - Host of the battlefield (zone owner) can move the card if it is in or entering their battlefield.
 * Hidden zones:
 * - Only the hidden zone owner may move cards out of it.
 * - Only the destination hidden zone owner may receive cards into it.
 */
export function canMoveCard(ctx: MoveContext): PermissionResult {
  const { actorId, card, fromZone, toZone } = ctx;
  const actorIsOwner = actorId === card.ownerId;
  const actorIsController = actorId === card.controllerId;
  const actorIsFromHost = actorId === fromZone.ownerId;
  const actorIsToHost = actorId === toZone.ownerId;
  const isToken = isTokenCard(card);

  const fromHidden = isHiddenZone(fromZone.type);
  const toHidden = isHiddenZone(toZone.type);
  const fromBattlefield = fromZone.type === ZONE.BATTLEFIELD;
  const toBattlefield = toZone.type === ZONE.BATTLEFIELD;
  const bothBattlefields = fromBattlefield && toBattlefield;

  // Cards (except tokens) may only exist in their owner's zones or any battlefield.
  if (!toBattlefield && toZone.ownerId !== card.ownerId) {
    return { allowed: false, reason: 'Cards may only enter their owner seat zones or any battlefield' };
  }

  // Hidden -> anything: only owner of the hidden zone can initiate.
  if (fromHidden && !actorIsFromHost) {
    return { allowed: false, reason: 'Cannot move from a hidden zone you do not own' };
  }

  // Anything -> hidden: only owner of destination hidden zone can receive.
  if (toHidden) {
    if (!actorIsToHost) {
      return { allowed: false, reason: 'Cannot place into a hidden zone you do not own' };
    }
    // Destination host is allowed to receive.
    return { allowed: true };
  }

  if (toZone.type === ZONE.COMMANDER && !actorIsOwner) {
    return { allowed: false, reason: "Cannot place cards into another player's command zone" };
  }

  const tokenLeavingBattlefield = isToken && fromBattlefield && !toBattlefield;
  if (tokenLeavingBattlefield) {
    // Tokens vanish when they leave the battlefield; only the owner can initiate this move.
    if (actorIsOwner) return { allowed: true };
    return { allowed: false, reason: 'Only owner may move this token off the battlefield' };
  }

  if (bothBattlefields) {
    if (actorIsOwner || actorIsController) return { allowed: true };
    return { allowed: false, reason: 'Only owner or controller may move this card between battlefields' };
  }

  if (toBattlefield) {
    // Entering a battlefield from a non-battlefield zone.
    if (actorIsOwner || actorIsController) return { allowed: true };
    return { allowed: false, reason: 'Only owner or controller may move this card here' };
  }

  // Non-battlefield destinations (seat zones): only the card owner may move their card here.
  if (actorIsOwner) return { allowed: true };

  // Host may move cards within their own non-hidden zones (e.g., public piles).
  if (actorIsFromHost && !fromHidden && !toHidden) return { allowed: true };

  return { allowed: false, reason: 'Not permitted to move this card' };
}

/**
 * Tapping/untapping is restricted to the controller and only on the battlefield.
 */
export function canTapCard(
  ctx: ActorContext,
  card: { controllerId: string },
  zone?: { type: ZoneType }
): PermissionResult {
  return requireBattlefieldController(ctx, card, zone, 'tap/untap');
}

/**
 * Battlefield-only controller actions such as edit text, P/T, face changes, counters, etc.
 */
export function canModifyCardState(
  ctx: ActorContext,
  card: { controllerId: string },
  zone?: { type: ZoneType }
): PermissionResult {
  return requireBattlefieldController(ctx, card, zone, 'modify this card');
}

/**
 * Tokens are created by the owner of the destination battlefield.
 */
export function canCreateToken(
  ctx: ActorContext,
  zone: { ownerId: string; type: ZoneType }
): PermissionResult {
  if (zone.type !== ZONE.BATTLEFIELD) {
    return { allowed: false, reason: 'Tokens can only enter the battlefield' };
  }

  const isOwner = ctx.actorId === zone.ownerId;
  return isOwner ? { allowed: true } : { allowed: false, reason: 'Only zone owner may create tokens here' };
}

/**
 * Player updates are self-service only.
 */
export function canUpdatePlayer(
  ctx: ActorContext,
  player: Player,
  updates: Partial<Player>
): PermissionResult {
  const isSelf = ctx.actorId === player.id;
  if (isSelf) return { allowed: true };

  const isLifeChange =
    updates.life !== undefined || updates.commanderDamage !== undefined;
  if (isLifeChange) {
    return {
      allowed: false,
      reason: "Cannot change another player's life total",
    };
  }

  if (updates.name !== undefined) {
    return { allowed: false, reason: "Cannot change another player's name" };
  }

  return { allowed: false, reason: "Cannot update another player" };
}
