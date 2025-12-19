import type { Card, PlayerId, ZoneType } from "@/types";
import { ZONE } from "@/constants/zones";

export const isHiddenZoneType = (zoneType: ZoneType | undefined) => {
  return zoneType === ZONE.HAND || zoneType === ZONE.LIBRARY;
};

export const isPublicZoneType = (zoneType: ZoneType | undefined) => {
  return Boolean(zoneType) && !isHiddenZoneType(zoneType);
};

export const canViewerPeekBattlefieldFaceDown = (
  card: Pick<Card, "controllerId">,
  viewerId: PlayerId
) => {
  return card.controllerId === viewerId;
};

export const canViewerSeeCardIdentity = (
  card: Pick<Card, "ownerId" | "controllerId" | "faceDown" | "knownToAll" | "revealedToAll" | "revealedTo">,
  zoneType: ZoneType | undefined,
  viewerId: PlayerId
) => {
  if (card.ownerId === viewerId) return true;

  if (zoneType === ZONE.BATTLEFIELD && card.faceDown) {
    return canViewerPeekBattlefieldFaceDown(card, viewerId);
  }

  if (isHiddenZoneType(zoneType)) {
    if (card.knownToAll) return true;
    if (card.revealedToAll) return true;
    return Boolean(card.revealedTo?.includes(viewerId));
  }

  return true;
};

export const shouldRenderFaceDown = (
  card: Pick<Card, "faceDown" | "ownerId" | "controllerId" | "knownToAll" | "revealedToAll" | "revealedTo">,
  zoneType: ZoneType | undefined,
  viewerId: PlayerId
) => {
  if (zoneType === ZONE.BATTLEFIELD && card.faceDown) return true;
  if (isHiddenZoneType(zoneType)) {
    return !canViewerSeeCardIdentity(card, zoneType, viewerId);
  }
  return false;
};

