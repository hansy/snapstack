import type { Card, Player, Zone, ZoneType } from "../types";
import { isTokenCard } from "../types";
import { LEGACY_COMMAND_ZONE, ZONE, isHiddenZoneType } from "../constants/zones";
import type { ActorContext, MoveContext, PermissionResult, ViewResult } from "./types";

type ActorInput = ActorContext | string;

const normalizeActor = (actor: ActorInput): ActorContext =>
  typeof actor === "string" ? { actorId: actor } : actor;

const isSpectator = (actor: ActorContext) => actor.role === "spectator";

const allow = (): PermissionResult => ({ allowed: true });
const deny = (reason: string): PermissionResult => ({ allowed: false, reason });

const requireBattlefieldController = (
  actor: ActorInput,
  card: { controllerId: string },
  zone: { type: ZoneType } | null | undefined,
  action: string
): PermissionResult => {
  const ctx = normalizeActor(actor);
  if (isSpectator(ctx)) {
    return deny("Spectators cannot modify cards");
  }
  if (!zone || zone.type !== ZONE.BATTLEFIELD) {
    return deny(`Cards can only ${action} on the battlefield`);
  }
  if (ctx.actorId !== card.controllerId) {
    return deny(`Only controller may ${action}`);
  }
  return allow();
};

export function canTapCard(
  actorId: string,
  card: { controllerId: string },
  zone: { type: ZoneType } | null | undefined
): PermissionResult;
export function canTapCard(
  ctx: ActorContext,
  card: { controllerId: string },
  zone: { type: ZoneType } | null | undefined
): PermissionResult;
export function canTapCard(
  actor: ActorInput,
  card: { controllerId: string },
  zone: { type: ZoneType } | null | undefined
): PermissionResult {
  return requireBattlefieldController(actor, card, zone, "tap/untap");
}

export function canModifyCardState(
  actorId: string,
  card: { controllerId: string },
  zone: { type: ZoneType } | null | undefined
): PermissionResult;
export function canModifyCardState(
  ctx: ActorContext,
  card: { controllerId: string },
  zone: { type: ZoneType } | null | undefined
): PermissionResult;
export function canModifyCardState(
  actor: ActorInput,
  card: { controllerId: string },
  zone: { type: ZoneType } | null | undefined
): PermissionResult {
  return requireBattlefieldController(actor, card, zone, "modify this card");
}

export function canUpdatePlayer(
  actorId: string,
  player: Player,
  updates: Partial<Player> & Record<string, unknown>
): PermissionResult;
export function canUpdatePlayer(
  ctx: ActorContext,
  player: Player,
  updates: Partial<Player> & Record<string, unknown>
): PermissionResult;
export function canUpdatePlayer(
  actor: ActorInput,
  player: Player,
  updates: Partial<Player> & Record<string, unknown>
): PermissionResult {
  const ctx = normalizeActor(actor);
  if (isSpectator(ctx)) {
    return deny("Spectators cannot update players");
  }
  if (ctx.actorId === player.id) return allow();

  const isLifeChange = updates.life !== undefined || updates.commanderDamage !== undefined;
  if (isLifeChange) {
    return deny("Cannot change another player's life total");
  }

  if (updates.name !== undefined) {
    return deny("Cannot change another player's name");
  }

  return deny("Cannot update another player");
}

export function canViewHiddenZone(actorId: string, zone: Zone): PermissionResult;
export function canViewHiddenZone(ctx: ActorContext, zone: Zone): PermissionResult;
export function canViewHiddenZone(actor: ActorInput, zone: Zone): PermissionResult {
  const ctx = normalizeActor(actor);
  if (isHiddenZoneType(zone.type) && zone.ownerId !== ctx.actorId) {
    return deny("Hidden zone");
  }
  return allow();
}

/**
 * Who can see what in a zone.
 * - Hidden zones (library, hand): only zone owner; library "view all" is owner-only.
 * - Public zones: everyone sees faces.
 */
export function canViewZone(
  actor: ActorInput,
  zone: { ownerId: string; type: ZoneType },
  _opts: { viewAll?: boolean } = {}
): ViewResult {
  const ctx = normalizeActor(actor);
  const isOwner = ctx.actorId === zone.ownerId;

  if (isHiddenZoneType(zone.type)) {
    if (isSpectator(ctx)) {
      if (zone.type === ZONE.HAND) return { allowed: true, visibility: "faces" };
      return { allowed: false, reason: "Hidden zone" };
    }
    if (!isOwner) return { allowed: false, reason: "Hidden zone" };
    // Library "view all" is implicitly owner-only; already satisfied by isOwner.
    return { allowed: true, visibility: "faces" };
  }

  return { allowed: true, visibility: "faces" };
}

export function canMoveCard(ctx: MoveContext): PermissionResult;
export function canMoveCard(
  actorId: string,
  card: Card,
  fromZone: Zone,
  toZone: Zone
): PermissionResult;
export function canMoveCard(
  actorOrCtx: MoveContext | string,
  card?: Card,
  fromZone?: Zone,
  toZone?: Zone
): PermissionResult {
  const ctx: MoveContext =
    typeof actorOrCtx === "string"
      ? {
          actorId: actorOrCtx,
          card: card as Card,
          fromZone: fromZone as Zone,
          toZone: toZone as Zone,
        }
      : actorOrCtx;

  if (isSpectator(ctx)) {
    return deny("Spectators cannot move cards");
  }

  const { actorId, card: movingCard, fromZone: startZone, toZone: destZone } = ctx;
  const actorIsOwner = actorId === movingCard.ownerId;
  const actorIsController = actorId === movingCard.controllerId;
  const actorIsFromHost = actorId === startZone.ownerId;
  const actorIsToHost = actorId === destZone.ownerId;
  const isToken = isTokenCard(movingCard);

  const fromHidden = isHiddenZoneType(startZone.type);
  const toHidden = isHiddenZoneType(destZone.type);
  const fromBattlefield = startZone.type === ZONE.BATTLEFIELD;
  const toBattlefield = destZone.type === ZONE.BATTLEFIELD;
  const bothBattlefields = fromBattlefield && toBattlefield;

  // Cards (except tokens) may only exist in their owner's zones or any battlefield.
  if (!toBattlefield && destZone.ownerId !== movingCard.ownerId) {
    return deny("Cards may only enter their owner seat zones or any battlefield");
  }

  // Hidden -> anything: only owner of the hidden zone can initiate.
  if (fromHidden && !actorIsFromHost) {
    return deny("Cannot move from a hidden zone you do not own");
  }

  // Anything -> hidden: only owner of destination hidden zone can receive.
  if (toHidden) {
    if (!actorIsToHost) {
      return deny("Cannot place into a hidden zone you do not own");
    }
    // Destination host is allowed to receive.
    return allow();
  }

  const toZoneType = destZone.type as ZoneType | typeof LEGACY_COMMAND_ZONE;
  if ((toZoneType === ZONE.COMMANDER || toZoneType === LEGACY_COMMAND_ZONE) && !actorIsOwner) {
    return deny("Cannot place cards into another player's command zone");
  }

  const tokenLeavingBattlefield = isToken && fromBattlefield && !toBattlefield;
  if (tokenLeavingBattlefield) {
    // Tokens vanish when they leave the battlefield; only the owner can initiate this move.
    return actorIsOwner ? allow() : deny("Only owner may move this token off the battlefield");
  }

  if (bothBattlefields) {
    return actorIsOwner || actorIsController
      ? allow()
      : deny("Only owner or controller may move this card between battlefields");
  }

  if (toBattlefield) {
    // Entering a battlefield from a non-battlefield zone.
    return actorIsOwner || actorIsController
      ? allow()
      : deny("Only owner or controller may move this card here");
  }

  // Non-battlefield destinations (seat zones): only the card owner may move their card here.
  if (actorIsOwner) return allow();

  // Host may move cards within their own non-hidden zones (e.g., public piles).
  if (actorIsFromHost && !fromHidden && !toHidden) return allow();

  return deny("Not permitted to move this card");
}

export function canAddCard(actorId: string, card: Card, zone: Zone): PermissionResult;
export function canAddCard(ctx: ActorContext, card: Card, zone: Zone): PermissionResult;
export function canAddCard(actor: ActorInput, card: Card, zone: Zone): PermissionResult {
  const ctx = normalizeActor(actor);
  if (isTokenCard(card) && zone.type !== ZONE.BATTLEFIELD) {
    return deny("Tokens can only enter the battlefield");
  }
  if (isHiddenZoneType(zone.type)) {
    if (zone.ownerId !== ctx.actorId) {
      return deny("Cannot place into a hidden zone you do not own");
    }
    if (card.ownerId !== zone.ownerId) {
      return deny("Cards may only enter their owner seat zones or any battlefield");
    }
    return allow();
  }

  if (zone.type === ZONE.BATTLEFIELD) {
    if (ctx.actorId === card.ownerId || ctx.actorId === card.controllerId) return allow();
    return deny("Only owner or controller may move this card here");
  }

  const zoneType = zone.type as ZoneType | typeof LEGACY_COMMAND_ZONE;
  if ((zoneType === ZONE.COMMANDER || zoneType === LEGACY_COMMAND_ZONE) && card.ownerId !== zone.ownerId) {
    return deny("Cannot place cards into another player's command zone");
  }

  if (card.ownerId !== zone.ownerId) {
    return deny("Cards may only enter their owner seat zones or any battlefield");
  }

  return ctx.actorId === card.ownerId ? allow() : deny("Not permitted to move this card");
}

export function canRemoveToken(actorId: string, card: Card, zone: Zone): PermissionResult;
export function canRemoveToken(ctx: ActorContext, card: Card, zone: Zone): PermissionResult;
export function canRemoveToken(actor: ActorInput, card: Card, zone: Zone): PermissionResult {
  const ctx = normalizeActor(actor);
  if (!isTokenCard(card)) {
    return deny("Direct remove is allowed only for tokens");
  }
  const actorIsOwner = ctx.actorId === card.ownerId;
  const actorIsController = ctx.actorId === card.controllerId;
  const actorIsZoneHost = ctx.actorId === zone.ownerId;
  if (actorIsOwner || actorIsController || actorIsZoneHost) return allow();
  return deny("Only owner, controller, or zone host may remove this token");
}

/**
 * Tokens are created by the owner of the destination battlefield.
 */
export function canCreateToken(actor: ActorInput, zone: { ownerId: string; type: ZoneType }): PermissionResult {
  const ctx = normalizeActor(actor);
  if (isSpectator(ctx)) {
    return deny("Spectators cannot create tokens");
  }
  if (zone.type !== ZONE.BATTLEFIELD) {
    return deny("Tokens can only enter the battlefield");
  }

  const isOwner = ctx.actorId === zone.ownerId;
  return isOwner
    ? allow()
    : deny("Only zone owner may create tokens here");
}
