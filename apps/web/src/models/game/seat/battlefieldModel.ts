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
  mirrorForViewer?: boolean;
  playerColors: Record<string, string>;
}): BattlefieldCardLayout => {
  const { card, zoneOwnerId, viewerPlayerId, mirrorForViewer, playerColors } = params;

  const viewPosition = mirrorForViewer ? mirrorNormalizedY(card.position) : card.position;
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
  const disableDrag = card.controllerId !== viewerPlayerId;

  return { left, top, highlightColor, disableDrag };
};

