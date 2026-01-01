import { BASE_CARD_HEIGHT, CARD_ASPECT_RATIO } from './constants';
import {
  fromNormalizedPosition,
  mirrorNormalizedY,
  snapNormalizedWithZone,
  toNormalizedPosition,
} from './positions';
import { clampToZoneBounds } from './dndMath';

export type RectLike = Pick<
  DOMRect,
  'left' | 'top' | 'right' | 'bottom' | 'width' | 'height'
>;

export const getEffectiveCardSize = (params: { viewScale: number; isTapped: boolean }) => {
  const baseWidth = BASE_CARD_HEIGHT * CARD_ASPECT_RATIO;
  const cardWidth = (params.isTapped ? BASE_CARD_HEIGHT : baseWidth) * params.viewScale;
  const cardHeight = (params.isTapped ? baseWidth : BASE_CARD_HEIGHT) * params.viewScale;
  return { cardWidth, cardHeight };
};

export const computeBattlefieldPlacement = (params: {
  centerScreen: { x: number; y: number };
  overRect: RectLike;
  zoneScale: number;
  viewScale: number;
  mirrorY: boolean;
  isTapped: boolean;
}) => {
  const safeScale = params.zoneScale || 1;
  const zoneWidth = (params.overRect.width || 0) / safeScale;
  const zoneHeight = (params.overRect.height || 0) / safeScale;

  const unsnappedPos = {
    x: (params.centerScreen.x - params.overRect.left) / safeScale,
    y: (params.centerScreen.y - params.overRect.top) / safeScale,
  };

  const { cardWidth, cardHeight } = getEffectiveCardSize({
    isTapped: params.isTapped,
    viewScale: params.viewScale || 1,
  });

  const clampedPos = clampToZoneBounds(
    unsnappedPos,
    zoneWidth,
    zoneHeight,
    cardWidth,
    cardHeight
  );

  const unsnappedNormalized = toNormalizedPosition(clampedPos, zoneWidth, zoneHeight);
  const unsnappedCanonical = params.mirrorY
    ? mirrorNormalizedY(unsnappedNormalized)
    : unsnappedNormalized;
  const snappedCanonical = snapNormalizedWithZone(
    unsnappedCanonical,
    zoneWidth,
    zoneHeight,
    cardWidth,
    cardHeight
  );

  const ghostNormalized = params.mirrorY
    ? mirrorNormalizedY(snappedCanonical)
    : snappedCanonical;
  const ghostPosition = fromNormalizedPosition(ghostNormalized, zoneWidth, zoneHeight);

  return {
    cardWidth,
    cardHeight,
    zoneWidth,
    zoneHeight,
    snappedCanonical,
    ghostPosition,
  };
};

