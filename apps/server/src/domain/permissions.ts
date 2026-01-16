import { isTokenCard } from "../../../web/src/types/cards";
import type { Card } from "../../../web/src/types/cards";
import type { Player } from "../../../web/src/types/players";
import type { Zone, ZoneType } from "../../../web/src/types/zones";

import { LEGACY_COMMAND_ZONE, ZONE, isHiddenZoneType } from "./constants";
import type { PermissionResult } from "./types";

const allow = (): PermissionResult => ({ allowed: true });
const deny = (reason: string): PermissionResult => ({ allowed: false, reason });

const requireBattlefieldController = (
  actorId: string,
  card: { controllerId: string },
  zone: { type: ZoneType } | null | undefined,
  action: string
): PermissionResult => {
  if (!zone || zone.type !== ZONE.BATTLEFIELD) {
    return deny(`Cards can only ${action} on the battlefield`);
  }
  if (actorId !== card.controllerId) {
    return deny(`Only controller may ${action}`);
  }
  return allow();
};

export const canTapCard = (
  actorId: string,
  card: { controllerId: string },
  zone: { type: ZoneType } | null | undefined
): PermissionResult => requireBattlefieldController(actorId, card, zone, "tap/untap");

export const canModifyCardState = (
  actorId: string,
  card: { controllerId: string },
  zone: { type: ZoneType } | null | undefined
): PermissionResult => requireBattlefieldController(actorId, card, zone, "modify this card");

export const canUpdatePlayer = (
  actorId: string,
  player: Player,
  updates: Record<string, unknown>
): PermissionResult => {
  if (actorId === player.id) return allow();

  const isLifeChange = updates.life !== undefined || updates.commanderDamage !== undefined;
  if (isLifeChange) {
    return deny("Cannot change another player's life total");
  }

  if (updates.name !== undefined) {
    return deny("Cannot change another player's name");
  }

  return deny("Cannot update another player");
};

export const canViewHiddenZone = (actorId: string, zone: Zone): PermissionResult => {
  if (isHiddenZoneType(zone.type) && zone.ownerId !== actorId) {
    return deny("Hidden zone");
  }
  return allow();
};

export const canMoveCard = (
  actorId: string,
  card: Card,
  fromZone: Zone,
  toZone: Zone
): PermissionResult => {
  const actorIsOwner = actorId === card.ownerId;
  const actorIsController = actorId === card.controllerId;
  const actorIsFromHost = actorId === fromZone.ownerId;
  const actorIsToHost = actorId === toZone.ownerId;
  const isToken = isTokenCard(card);

  const fromHidden = isHiddenZoneType(fromZone.type);
  const toHidden = isHiddenZoneType(toZone.type);
  const fromBattlefield = fromZone.type === ZONE.BATTLEFIELD;
  const toBattlefield = toZone.type === ZONE.BATTLEFIELD;
  const bothBattlefields = fromBattlefield && toBattlefield;

  if (!toBattlefield && toZone.ownerId !== card.ownerId) {
    return deny("Cards may only enter their owner seat zones or any battlefield");
  }

  if (fromHidden && !actorIsFromHost) {
    return deny("Cannot move from a hidden zone you do not own");
  }

  if (toHidden) {
    if (!actorIsToHost) {
      return deny("Cannot place into a hidden zone you do not own");
    }
    return allow();
  }

  const toZoneType = toZone.type as ZoneType | typeof LEGACY_COMMAND_ZONE;
  if ((toZoneType === ZONE.COMMANDER || toZoneType === LEGACY_COMMAND_ZONE) && !actorIsOwner) {
    return deny("Cannot place cards into another player's command zone");
  }

  const tokenLeavingBattlefield = isToken && fromBattlefield && !toBattlefield;
  if (tokenLeavingBattlefield) {
    return actorIsOwner
      ? allow()
      : deny("Only owner may move this token off the battlefield");
  }

  if (bothBattlefields) {
    return actorIsOwner || actorIsController
      ? allow()
      : deny("Only owner or controller may move this card between battlefields");
  }

  if (toBattlefield) {
    return actorIsOwner || actorIsController
      ? allow()
      : deny("Only owner or controller may move this card here");
  }

  if (actorIsOwner) return allow();

  if (actorIsFromHost && !fromHidden && !toHidden) return allow();

  return deny("Not permitted to move this card");
};

export const canAddCard = (actorId: string, card: Card, zone: Zone): PermissionResult => {
  if (isTokenCard(card) && zone.type !== ZONE.BATTLEFIELD) {
    return deny("Tokens can only enter the battlefield");
  }
  if (isHiddenZoneType(zone.type)) {
    if (zone.ownerId !== actorId) {
      return deny("Cannot place into a hidden zone you do not own");
    }
    if (card.ownerId !== zone.ownerId) {
      return deny("Cards may only enter their owner seat zones or any battlefield");
    }
    return allow();
  }

  if (zone.type === ZONE.BATTLEFIELD) {
    if (actorId === card.ownerId || actorId === card.controllerId) return allow();
    return deny("Only owner or controller may move this card here");
  }

  const zoneType = zone.type as ZoneType | typeof LEGACY_COMMAND_ZONE;
  if ((zoneType === ZONE.COMMANDER || zoneType === LEGACY_COMMAND_ZONE) && card.ownerId !== zone.ownerId) {
    return deny("Cannot place cards into another player's command zone");
  }

  if (card.ownerId !== zone.ownerId) {
    return deny("Cards may only enter their owner seat zones or any battlefield");
  }

  return actorId === card.ownerId ? allow() : deny("Not permitted to move this card");
};

export const canRemoveToken = (actorId: string, card: Card, zone: Zone): PermissionResult => {
  if (!isTokenCard(card)) {
    return deny("Direct remove is allowed only for tokens");
  }
  const actorIsOwner = actorId === card.ownerId;
  const actorIsController = actorId === card.controllerId;
  const actorIsZoneHost = actorId === zone.ownerId;
  if (actorIsOwner || actorIsController || actorIsZoneHost) return allow();
  return deny("Only owner, controller, or zone host may remove this token");
};
