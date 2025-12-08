import { ZONE } from '../constants/zones';
import { ZoneType, isTokenCard, Player } from '../types';
import { ActorContext, MoveContext, PermissionResult, ViewResult } from './types';

const HIDDEN_ZONES = new Set<ZoneType>([ZONE.LIBRARY, ZONE.HAND]);
const SEAT_ZONES = new Set<ZoneType>([
  ZONE.LIBRARY,
  ZONE.HAND,
  ZONE.GRAVEYARD,
  ZONE.EXILE,
  ZONE.COMMANDER,
]);

const isHiddenZone = (zoneType: ZoneType) => HIDDEN_ZONES.has(zoneType);
const isSeatZone = (zoneType: ZoneType) => SEAT_ZONES.has(zoneType);

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
  const actorIsFromHost = actorId === fromZone.ownerId;
  const actorIsToHost = actorId === toZone.ownerId;
  const isToken = isTokenCard(card);

  const fromHidden = isHiddenZone(fromZone.type);
  const toHidden = isHiddenZone(toZone.type);
  const fromBattlefield = fromZone.type === ZONE.BATTLEFIELD;
  const toBattlefield = toZone.type === ZONE.BATTLEFIELD;
  const bothBattlefields = fromBattlefield && toBattlefield;

  // Non-battlefield destinations must belong to the card owner (battlefields are the only shared space).
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
    if (actorIsOwner) return { allowed: true };
    if (actorIsFromHost || actorIsToHost) return { allowed: true };
    return { allowed: false, reason: 'Only owner or host of battlefield may move this card' };
  }

  if (toBattlefield) {
    // Entering a battlefield from a non-battlefield zone.
    if (actorIsOwner || actorIsToHost) return { allowed: true };
    return { allowed: false, reason: 'Only card owner or battlefield host may move this card here' };
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
  if (!zone || zone.type !== ZONE.BATTLEFIELD) {
    return { allowed: false, reason: 'Cards can only be tapped on the battlefield' };
  }

  const isController = ctx.actorId === card.controllerId;
  return isController ? { allowed: true } : { allowed: false, reason: 'Only controller may tap/untap' };
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
 * Player updates that touch life/commander damage are self-service only.
 */
export function canUpdatePlayer(
  ctx: ActorContext,
  player: Player,
  updates: Partial<Player>
): PermissionResult {
  const isLifeChange = updates.life !== undefined || updates.commanderDamage !== undefined;
  if (!isLifeChange) return { allowed: true };

  const isSelf = ctx.actorId === player.id;
  return isSelf ? { allowed: true } : { allowed: false, reason: "Cannot change another player's life total" };
}
