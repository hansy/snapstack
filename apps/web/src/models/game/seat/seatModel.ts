import type {
  Card,
  LibraryRevealsToAll,
  LibraryTopRevealMode,
  PlayerId,
  ViewerRole,
  Zone,
  ZoneId,
  ZoneType,
} from '@/types';

import { getCardsInZone, getPlayerZones } from '@/lib/gameSelectors';
import { canViewerSeeLibraryCardByReveal } from '@/lib/reveal';

export type SeatPosition = 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';

export interface SeatModel {
  isTop: boolean;
  isRight: boolean;
  mirrorBattlefieldY: boolean;
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
  viewerRole?: ViewerRole;
  isMe: boolean;
  scale?: number;
  libraryTopReveal?: LibraryTopRevealMode | null;
  zones: Record<ZoneId, Zone>;
  cards: Record<string, Card>;
  libraryRevealsToAll?: LibraryRevealsToAll;
}): SeatModel => {
  const isTop = params.position.startsWith('top');
  const isRight = params.position.endsWith('right');
  const mirrorBattlefieldY = isTop;
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

  const resolveLibraryRevealOwner = (
    cardId: string,
    entry: LibraryRevealsToAll[string]
  ) => entry.ownerId ?? params.cards[cardId]?.ownerId ?? zones.library?.ownerId;

  const buildRevealedLibraryCards = () => {
    if (!zones.library) return [];
    const libraryZoneId = zones.library.id;
    const entries = Object.entries(params.libraryRevealsToAll ?? {})
      .map(([cardId, entry]) => ({
        cardId,
        entry,
        ownerId: resolveLibraryRevealOwner(cardId, entry),
      }))
      .filter((entry) => entry.ownerId === zones.library?.ownerId)
      .sort((a, b) => a.entry.orderKey.localeCompare(b.entry.orderKey));

    return entries.map(({ cardId, entry, ownerId }) => {
      const existing = params.cards[cardId];
      if (existing) {
        return {
          ...existing,
          ...entry.card,
          revealedToAll: true,
          zoneId: libraryZoneId,
        };
      }
      const fallbackOwner = ownerId ?? zones.library?.ownerId ?? params.playerId;
      return {
        id: cardId,
        ownerId: fallbackOwner,
        controllerId: fallbackOwner,
        zoneId: libraryZoneId,
        tapped: false,
        faceDown: false,
        position: { x: 0.5, y: 0.5 },
        rotation: 0,
        counters: [],
        revealedToAll: true,
        ...entry.card,
      } as Card;
    });
  };

  let libraryCards = zones.library?.cardIds.length
    ? getCardsInZone(params.cards, zones.library)
    : buildRevealedLibraryCards();

  if (
    (!zones.library || zones.library.cardIds.length === 0) &&
    params.isMe &&
    params.libraryTopReveal === "self"
  ) {
    const topCard = Object.values(params.cards).find((card) => {
      if (card.zoneId !== zones.library?.id) return false;
      return canViewerSeeLibraryCardByReveal(
        card,
        params.viewerPlayerId,
        params.viewerRole
      );
    });
    if (topCard) libraryCards = [topCard];
  }

  const cardsByZone = {
    library: libraryCards,
    graveyard: getCardsInZone(params.cards, zones.graveyard),
    exile: getCardsInZone(params.cards, zones.exile),
    battlefield: getCardsInZone(params.cards, zones.battlefield),
    commander: getCardsInZone(params.cards, zones.commander),
    hand: getCardsInZone(params.cards, zones.hand),
  };

  const opponentLibraryRevealCount =
    !params.isMe && zones.library
      ? Object.entries(params.libraryRevealsToAll ?? {}).reduce((count, [cardId, entry]) => {
          const ownerId = resolveLibraryRevealOwner(cardId, entry);
          if (ownerId !== zones.library?.ownerId) return count;
          return count + 1;
        }, 0)
      : 0;

  return {
    isTop,
    isRight,
    mirrorBattlefieldY,
    inverseScalePercent,
    zones,
    cards: cardsByZone,
    opponentLibraryRevealCount,
  };
};
