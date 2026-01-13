import type { Card, PlayerId } from '@/types';

import { BASE_CARD_HEIGHT, CARD_ASPECT_RATIO } from '@/lib/constants';
import { fromNormalizedPosition, mirrorNormalizedY } from '@/lib/positions';

export type BattlefieldCardLayout = {
  left: number;
  top: number;
  highlightColor?: string;
  disableDrag: boolean;
};

export const computeBattlefieldCardLayout = (params: {
  card: Card;
  zoneOwnerId: PlayerId;
  viewerPlayerId: PlayerId;
  zoneWidth: number;
  zoneHeight: number;
  mirrorBattlefieldY: boolean;
  playerColors: Record<string, string>;
}): BattlefieldCardLayout => {
  const { card, zoneOwnerId, viewerPlayerId, mirrorBattlefieldY, playerColors } = params;

  const viewPosition = mirrorBattlefieldY ? mirrorNormalizedY(card.position) : card.position;
  const { x, y } = fromNormalizedPosition(
    viewPosition,
    params.zoneWidth || 1,
    params.zoneHeight || 1
  );

  const baseWidth = BASE_CARD_HEIGHT * CARD_ASPECT_RATIO;
  const baseHeight = BASE_CARD_HEIGHT;
  const left = x - baseWidth / 2;
  const top = y - baseHeight / 2;

  const highlightColor = card.ownerId !== zoneOwnerId ? playerColors[card.ownerId] : undefined;
  const canDrag = card.controllerId === viewerPlayerId || card.ownerId === viewerPlayerId;
  const disableDrag = !canDrag;

  return { left, top, highlightColor, disableDrag };
};
