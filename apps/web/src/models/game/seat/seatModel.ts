import type { Card, PlayerId, Zone, ZoneId, ZoneType } from '@/types';

import { ZONE } from '@/constants/zones';
import { getCardsInZone, getPlayerZones } from '@/lib/gameSelectors';
import { canViewerSeeCardIdentity } from '@/lib/reveal';

export type SeatPosition = 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';

export interface SeatModel {
  isTop: boolean;
  isRight: boolean;
  inverseScalePercent: number;
  zones: {
    hand?: Zone;
    library?: Zone;
    graveyard?: Zone;
    exile?: Zone;
    battlefield?: Zone;
    commander?: Zone;
  };
  cards: {
    library: Card[];
    graveyard: Card[];
    exile: Card[];
    battlefield: Card[];
    commander: Card[];
    hand: Card[];
  };
  opponentLibraryRevealCount: number;
}

export const createSeatModel = (params: {
  playerId: PlayerId;
  position: SeatPosition;
  viewerPlayerId: PlayerId;
  isMe: boolean;
  scale?: number;
  zones: Record<ZoneId, Zone>;
  cards: Record<string, Card>;
}): SeatModel => {
  const isTop = params.position.startsWith('top');
  const isRight = params.position.endsWith('right');
  const safeScale = params.scale || 1;
  const inverseScalePercent = (1 / safeScale) * 100;

  const playerZones = getPlayerZones(params.zones, params.playerId) as Partial<
    Record<ZoneType, Zone>
  >;

  const zones = {
    hand: playerZones.hand,
    library: playerZones.library,
    graveyard: playerZones.graveyard,
    exile: playerZones.exile,
    battlefield: playerZones.battlefield,
    commander: playerZones.commander,
  };

  const cardsByZone = {
    library: getCardsInZone(params.cards, zones.library),
    graveyard: getCardsInZone(params.cards, zones.graveyard),
    exile: getCardsInZone(params.cards, zones.exile),
    battlefield: getCardsInZone(params.cards, zones.battlefield),
    commander: getCardsInZone(params.cards, zones.commander),
    hand: getCardsInZone(params.cards, zones.hand),
  };

  const opponentLibraryRevealCount =
    !params.isMe && zones.library
      ? zones.library.cardIds.reduce((count, id) => {
          const card = params.cards[id];
          if (!card) return count;
          return canViewerSeeCardIdentity(card, ZONE.LIBRARY, params.viewerPlayerId)
            ? count + 1
            : count;
        }, 0)
      : 0;

  return {
    isTop,
    isRight,
    inverseScalePercent,
    zones,
    cards: cardsByZone,
    opponentLibraryRevealCount,
  };
};

