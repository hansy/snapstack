import type { Card, CardId, PlayerId, ViewerRole, Zone, ZoneId, ZoneType } from "@/types";

import { ZONE } from "@/constants/zones";
import { canMoveCard } from "@/rules/permissions";
import { computeBattlefieldPlacement, type RectLike } from "@/lib/dndBattlefield";

export type GhostCardState = {
  zoneId: ZoneId;
  position: { x: number; y: number };
  tapped?: boolean;
};

export type DragMoveUiState = {
  ghostCard: GhostCardState | null;
  overCardScale: number;
};

export const computeDragMoveUiState = (params: {
  myPlayerId: PlayerId;
  viewerRole?: ViewerRole;
  cards: Record<CardId, Card>;
  zones: Record<ZoneId, Zone>;
  activeCardId?: CardId;
  activeRect?: RectLike | null;
  activeTapped?: boolean;
  over:
    | null
    | {
        id: ZoneId;
        type?: ZoneType;
        rect: RectLike;
        scale?: number;
        cardScale?: number;
        mirrorY?: boolean;
      };
}): DragMoveUiState => {
  if (!params.over) return { ghostCard: null, overCardScale: 1 };

  if (params.over.type !== ZONE.BATTLEFIELD) {
    return { ghostCard: null, overCardScale: 1 };
  }

  const activeCard = params.activeCardId
    ? params.cards[params.activeCardId]
    : undefined;
  if (!activeCard) return { ghostCard: null, overCardScale: 1 };

  const targetZone = params.zones[params.over.id];
  const fromZone = params.zones[activeCard.zoneId];
  if (!targetZone || !fromZone) {
    return { ghostCard: null, overCardScale: 1 };
  }

  const permission = canMoveCard({
    actorId: params.myPlayerId,
    role: params.viewerRole,
    card: activeCard,
    fromZone,
    toZone: targetZone,
  });
  if (!permission.allowed) {
    return { ghostCard: null, overCardScale: 1 };
  }

  const zoneScale = params.over.scale || 1;
  const viewScale = params.over.cardScale || 1;
  const mirrorY = Boolean(params.over.mirrorY);
  const isTapped = Boolean(params.activeTapped ?? activeCard.tapped);
  const overCardScale = viewScale;

  if (!params.activeRect) {
    return { ghostCard: null, overCardScale };
  }

  const centerScreen = {
    x: params.activeRect.left + params.activeRect.width / 2,
    y: params.activeRect.top + params.activeRect.height / 2,
  };

  const placement = computeBattlefieldPlacement({
    centerScreen,
    isTapped,
    mirrorY,
    overRect: params.over.rect,
    viewScale,
    zoneScale,
  });

  return {
    ghostCard: {
      zoneId: targetZone.id,
      position: placement.ghostPosition,
      tapped: isTapped,
    },
    overCardScale,
  };
};

export type DragEndPlan =
  | { kind: "none" }
  | { kind: "reorderHand"; zoneId: ZoneId; oldIndex: number; newIndex: number }
  | {
      kind: "moveCard";
      cardId: CardId;
      toZoneId: ZoneId;
      position: { x: number; y: number } | undefined;
    };

export const computeDragEndPlan = (params: {
  myPlayerId: PlayerId;
  viewerRole?: ViewerRole;
  cards: Record<CardId, Card>;
  zones: Record<ZoneId, Zone>;
  cardId: CardId;
  toZoneId: ZoneId;
  overCardId?: CardId;
  activeRect?: RectLike | null;
  overRect?: RectLike | null;
  overScale?: number;
  overCardScale?: number;
  mirrorY?: boolean;
  activeTapped?: boolean;
}): DragEndPlan => {
  const activeCard = params.cards[params.cardId];
  if (!activeCard) return { kind: "none" };

  const targetZone = params.zones[params.toZoneId];
  const fromZone = params.zones[activeCard.zoneId];
  if (!targetZone || !fromZone) return { kind: "none" };

  if (fromZone.id === targetZone.id && targetZone.type === ZONE.HAND) {
    if (!params.overCardId || params.cardId === params.overCardId) {
      return { kind: "none" };
    }
    const oldIndex = targetZone.cardIds.indexOf(params.cardId);
    const newIndex = targetZone.cardIds.indexOf(params.overCardId);
    if (oldIndex === -1 || newIndex === -1) return { kind: "none" };
    return { kind: "reorderHand", zoneId: targetZone.id, oldIndex, newIndex };
  }

  const permission = canMoveCard({
    actorId: params.myPlayerId,
    role: params.viewerRole,
    card: activeCard,
    fromZone,
    toZone: targetZone,
  });
  if (!permission.allowed) return { kind: "none" };

  if (targetZone.type !== ZONE.BATTLEFIELD) {
    return {
      kind: "moveCard",
      cardId: params.cardId,
      toZoneId: targetZone.id,
      position: undefined,
    };
  }

  if (!params.activeRect || !params.overRect) return { kind: "none" };

  const centerScreen = {
    x: params.activeRect.left + params.activeRect.width / 2,
    y: params.activeRect.top + params.activeRect.height / 2,
  };

  const zoneScale = params.overScale || 1;
  const viewScale = params.overCardScale || 1;
  const isTapped = Boolean(params.activeTapped ?? activeCard.tapped);
  const mirrorY = Boolean(params.mirrorY);

  const placement = computeBattlefieldPlacement({
    centerScreen,
    isTapped,
    mirrorY,
    overRect: params.overRect,
    viewScale,
    zoneScale,
  });

  return {
    kind: "moveCard",
    cardId: params.cardId,
    toZoneId: targetZone.id,
    position: placement.snappedCanonical,
  };
};
