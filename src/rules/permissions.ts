import { ZONE } from '../constants/zones';
import { ZoneType } from '../types';
import { ActorContext, MoveContext, PermissionResult, ViewResult } from './types';

const HIDDEN_ZONES = new Set<ZoneType>([ZONE.LIBRARY, ZONE.HAND]);

const isHiddenZone = (zoneType: ZoneType) => HIDDEN_ZONES.has(zoneType);

/**
 * Who can see what in a zone.
 * - Hidden zones (library, hand): only zone owner; library "view all" is owner-only.
 * - Public zones: everyone sees faces.
 */
export function canViewZone(
  ctx: ActorContext,
  zone: { ownerId: string; type: ZoneType },
  opts: { viewAll?: boolean } = {}
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

  const fromHidden = isHiddenZone(fromZone.type);
  const toHidden = isHiddenZone(toZone.type);
  const bothBattlefields = fromZone.type === ZONE.BATTLEFIELD && toZone.type === ZONE.BATTLEFIELD;

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

  if (bothBattlefields) {
    if (actorIsOwner) return { allowed: true };
    if (actorIsFromHost || actorIsToHost) return { allowed: true };
    return { allowed: false, reason: 'Only owner or host of battlefield may move this card' };
  }

  // Default allowance: owner can move their own card between non-hidden zones they interact with.
  if (actorIsOwner) return { allowed: true };

  // Host may move cards within their own non-hidden zones (e.g., public piles).
  if (actorIsFromHost && !fromHidden && !toHidden) return { allowed: true };

  return { allowed: false, reason: 'Not permitted to move this card' };
}

/**
 * Tapping/untapping is restricted to the controller (or owner if you prefer tighter control).
 */
export function canTapCard(ctx: ActorContext, card: { controllerId: string }): PermissionResult {
  const isController = ctx.actorId === card.controllerId;
  return isController ? { allowed: true } : { allowed: false, reason: 'Only controller may tap/untap' };
}
