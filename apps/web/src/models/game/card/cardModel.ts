import type React from "react";
import type { ZoneType } from "@/types";

import { ZONE } from "@/constants/zones";

export const BATTLEFIELD_HOVER_PREVIEW_DELAY_MS = 250;

export type CardHoverPreviewPolicy =
  | { kind: "none" }
  | { kind: "immediate" }
  | { kind: "delayed"; delayMs: number };

export const computeCardContainerStyle = (params: {
  propStyle?: React.CSSProperties;
  scale?: number;
  tapped?: boolean;
  isDragging?: boolean;
}): React.CSSProperties => {
  const { transform: propTransform, ...restPropStyle } = params.propStyle || {};
  const transformParts: string[] = [];
  if (typeof propTransform === "string") transformParts.push(propTransform);
  if (params.scale && params.scale !== 1)
    transformParts.push(`scale(${params.scale})`);
  if (params.tapped) transformParts.push("rotate(90deg)");

  return {
    ...restPropStyle,
    transform: transformParts.length ? transformParts.join(" ") : undefined,
    transformOrigin: "center center",
    opacity: params.isDragging ? 0 : 1,
  };
};

export const getCardHoverPreviewPolicy = (params: {
  zoneType: ZoneType | undefined;
  canPeek: boolean;
  faceDown?: boolean;
  isDragging: boolean;
}): CardHoverPreviewPolicy => {
  if (params.isDragging) return { kind: "none" };
  if (!params.zoneType) return { kind: "none" };
  if (params.faceDown && !params.canPeek) return { kind: "none" };

  if (params.zoneType === ZONE.HAND) {
    return params.canPeek ? { kind: "immediate" } : { kind: "none" };
  }
  if (params.zoneType === ZONE.COMMANDER) return { kind: "immediate" };
  if (params.zoneType === ZONE.BATTLEFIELD) {
    return { kind: "delayed", delayMs: BATTLEFIELD_HOVER_PREVIEW_DELAY_MS };
  }
  return { kind: "none" };
};

export const canToggleCardPreviewLock = (params: {
  zoneType: ZoneType | undefined;
  canPeek: boolean;
  faceDown?: boolean;
  isDragging: boolean;
}) => {
  if (params.isDragging) return false;
  if (!params.zoneType) return false;

  const allowedInHand = params.zoneType === ZONE.HAND && params.canPeek;
  if (params.zoneType !== ZONE.BATTLEFIELD && !allowedInHand) return false;
  if (params.faceDown && !params.canPeek) return false;
  return true;
};

export const shouldDisableHoverAnimation = (params: {
  zoneType: ZoneType | undefined;
  ownerId: string;
  viewerId: string;
}) => {
  return params.zoneType === ZONE.HAND && params.ownerId !== params.viewerId;
};

