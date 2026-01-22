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
  const { cardWidth: baseCardWidth, cardHeight: baseCardHeight } =
    getEffectiveCardSize({
      isTapped: params.isTapped,
      viewScale: 1,
    });

  const clampedPos = clampToZoneBounds(
    unsnappedPos,
    zoneWidth,
    zoneHeight,
    cardWidth,
    cardHeight
  );
  const clampedCanonicalPos = clampToZoneBounds(
    unsnappedPos,
    zoneWidth,
    zoneHeight,
    baseCardWidth,
    baseCardHeight
  );

  const unsnappedNormalized = toNormalizedPosition(
    clampedPos,
    zoneWidth,
    zoneHeight
  );
  const unsnappedCanonicalNormalized = toNormalizedPosition(
    clampedCanonicalPos,
    zoneWidth,
    zoneHeight
  );
  const ghostCanonical = params.mirrorY
    ? mirrorNormalizedY(unsnappedNormalized)
    : unsnappedNormalized;
  const baseCanonical = params.mirrorY
    ? mirrorNormalizedY(unsnappedCanonicalNormalized)
    : unsnappedCanonicalNormalized;
  const snappedGhostCanonical = snapNormalizedWithZone(
    ghostCanonical,
    zoneWidth,
    zoneHeight,
    cardWidth,
    cardHeight
  );
  const snappedCanonical = snapNormalizedWithZone(
    baseCanonical,
    zoneWidth,
    zoneHeight,
    baseCardWidth,
    baseCardHeight
  );

  const ghostNormalized = params.mirrorY
    ? mirrorNormalizedY(snappedGhostCanonical)
    : snappedGhostCanonical;
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
