import type { Card, FaceDownMode, Zone } from "@/types";
import type { CardPatch } from "@/yjs/yMutations";

import { ZONE } from "@/constants/zones";
import { clampNormalizedPosition, migratePositionToNormalized } from "@/lib/positions";

export const resolveControllerAfterMove = (card: Card, fromZone: Zone, toZone: Zone): string => {
  if (toZone.type === ZONE.BATTLEFIELD) {
    if (toZone.ownerId === card.ownerId) return card.ownerId;
    if (fromZone.ownerId !== toZone.ownerId) return toZone.ownerId;
  } else {
    if (card.controllerId !== card.ownerId) return card.ownerId;
  }
  return card.controllerId;
};

export const normalizeMovePosition = (
  position: { x: number; y: number } | undefined,
  fallback: { x: number; y: number }
) => {
  const normalizedInput =
    position && (position.x > 1 || position.y > 1) ? migratePositionToNormalized(position) : position;
  return clampNormalizedPosition(normalizedInput ?? fallback);
};

export type FaceDownMoveResolution = {
  effectiveFaceDown: boolean;
  /**
   * `undefined` means "do not write/patch faceDown" (battlefield-to-battlefield default behavior).
   */
  patchFaceDown?: boolean;
  effectiveFaceDownMode?: FaceDownMode;
  /**
   * `undefined` means "do not write/patch faceDownMode".
   * `null` means "clear faceDownMode".
   */
  patchFaceDownMode?: FaceDownMode | null;
};

export const resolveFaceDownAfterMove = ({
  fromZoneType,
  toZoneType,
  currentFaceDown,
  currentFaceDownMode,
  requestedFaceDown,
  requestedFaceDownMode,
}: {
  fromZoneType: string;
  toZoneType: string;
  currentFaceDown: boolean;
  currentFaceDownMode?: FaceDownMode;
  requestedFaceDown: boolean | undefined;
  requestedFaceDownMode?: FaceDownMode;
}): FaceDownMoveResolution => {
  if (requestedFaceDown !== undefined) {
    const nextMode = requestedFaceDown ? requestedFaceDownMode : undefined;
    return {
      effectiveFaceDown: requestedFaceDown,
      patchFaceDown: requestedFaceDown,
      effectiveFaceDownMode: nextMode,
      patchFaceDownMode: requestedFaceDown ? (requestedFaceDownMode ?? null) : currentFaceDownMode ? null : undefined,
    };
  }

  const battlefieldToBattlefield = fromZoneType === ZONE.BATTLEFIELD && toZoneType === ZONE.BATTLEFIELD;
  if (battlefieldToBattlefield) {
    return {
      effectiveFaceDown: currentFaceDown,
      patchFaceDown: undefined,
      effectiveFaceDownMode: currentFaceDown ? currentFaceDownMode : undefined,
      patchFaceDownMode: currentFaceDown ? undefined : currentFaceDownMode ? null : undefined,
    };
  }

  return {
    effectiveFaceDown: false,
    patchFaceDown: false,
    effectiveFaceDownMode: undefined,
    patchFaceDownMode: currentFaceDownMode ? null : undefined,
  };
};

export const computeRevealPatchAfterMove = ({
  fromZoneType,
  toZoneType,
  effectiveFaceDown,
}: {
  fromZoneType: string;
  toZoneType: string;
  effectiveFaceDown: boolean;
}): CardPatch | null => {
  const toHidden = toZoneType === ZONE.HAND || toZoneType === ZONE.LIBRARY;
  const enteringLibrary = toZoneType === ZONE.LIBRARY && fromZoneType !== ZONE.LIBRARY;
  const faceDownBattlefield = toZoneType === ZONE.BATTLEFIELD && effectiveFaceDown === true;

  if (enteringLibrary || faceDownBattlefield) {
    return { knownToAll: false, revealedToAll: false, revealedTo: [] };
  }

  if (!toHidden && !faceDownBattlefield) {
    return { knownToAll: true };
  }

  return null;
};
