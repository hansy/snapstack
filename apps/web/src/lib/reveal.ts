import type { Card, LibraryTopRevealMode, PlayerId, ViewerRole, ZoneType } from "@/types";
import { ZONE } from "@/constants/zones";

export const isHiddenZoneType = (zoneType: ZoneType | undefined) => {
  return zoneType === ZONE.HAND || zoneType === ZONE.LIBRARY || zoneType === ZONE.SIDEBOARD;
};

export const isPublicZoneType = (zoneType: ZoneType | undefined) => {
  return Boolean(zoneType) && !isHiddenZoneType(zoneType);
};

export const canViewerSeeLibraryCardByReveal = (
  card: Pick<Card, "knownToAll" | "revealedToAll" | "revealedTo">,
  viewerId: PlayerId,
  viewerRole?: ViewerRole
) => {
  if (card.knownToAll) return true;
  if (card.revealedToAll) return true;
  if (viewerRole === "spectator") return Boolean(card.revealedTo && card.revealedTo.length > 0);
  return Boolean(card.revealedTo?.includes(viewerId));
};

export const canViewerSeeLibraryTopCard = (params: {
  viewerId: PlayerId;
  ownerId: PlayerId;
  mode?: LibraryTopRevealMode | null;
}) => {
  if (params.mode === "all") return true;
  if (params.mode === "self") return params.viewerId === params.ownerId;
  return false;
};

export const canViewerPeekBattlefieldFaceDown = (
  card: Pick<Card, "controllerId">,
  viewerId: PlayerId,
  viewerRole?: ViewerRole
) => {
  if (viewerRole === "spectator") return true;
  return card.controllerId === viewerId;
};

export const canViewerSeeCardIdentity = (
  card: Pick<Card, "ownerId" | "controllerId" | "faceDown" | "knownToAll" | "revealedToAll" | "revealedTo">,
  zoneType: ZoneType | undefined,
  viewerId: PlayerId,
  viewerRole?: ViewerRole
) => {
  if (viewerRole === "spectator") {
    if (zoneType === ZONE.HAND) return true;
    if (zoneType === ZONE.LIBRARY || zoneType === ZONE.SIDEBOARD) {
      return Boolean(
        card.knownToAll ||
          card.revealedToAll ||
          (card.revealedTo && card.revealedTo.length > 0)
      );
    }
    if (zoneType === ZONE.BATTLEFIELD && card.faceDown) return true;
    return true;
  }

  if (card.ownerId === viewerId) return true;

  if (zoneType === ZONE.BATTLEFIELD && card.faceDown) {
    if (card.knownToAll) return true;
    if (card.revealedToAll) return true;
    if (card.revealedTo?.includes(viewerId)) return true;
    return canViewerPeekBattlefieldFaceDown(card, viewerId, viewerRole);
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
  viewerId: PlayerId,
  viewerRole?: ViewerRole
) => {
  if (zoneType === ZONE.BATTLEFIELD && card.faceDown) return true;
  if (isHiddenZoneType(zoneType)) {
    return !canViewerSeeCardIdentity(card, zoneType, viewerId, viewerRole);
  }
  return false;
};
