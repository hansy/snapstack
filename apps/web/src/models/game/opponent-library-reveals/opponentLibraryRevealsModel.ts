import type {
  Card,
  LibraryRevealsToAll,
  LibraryTopRevealMode,
  Player,
  PlayerId,
  Zone,
} from "@/types";

import { ZONE } from "@/constants/zones";

export const resolveZoneOwnerName = (params: {
  zone: Pick<Zone, "ownerId"> | null;
  players: Record<PlayerId, Pick<Player, "name">>;
}): string => {
  if (!params.zone) return "";
  return params.players[params.zone.ownerId]?.name ?? params.zone.ownerId;
};

const buildLibraryRevealCard = (params: {
  cardId: string;
  entry: LibraryRevealsToAll[string];
  zone: Zone;
  cardsById: Record<string, Card>;
}): Card => {
  const existing = params.cardsById[params.cardId];
  const ownerId =
    params.entry.ownerId ?? existing?.ownerId ?? params.zone.ownerId;
  if (existing) {
    return {
      ...existing,
      ...params.entry.card,
      revealedToAll: true,
      zoneId: params.zone.id,
    };
  }
  return {
    id: params.cardId,
    ownerId,
    controllerId: ownerId,
    zoneId: params.zone.id,
    tapped: false,
    faceDown: false,
    position: { x: 0.5, y: 0.5 },
    rotation: 0,
    counters: [],
    revealedToAll: true,
    ...params.entry.card,
  };
};

export const computeRevealedOpponentLibraryCards = (params: {
  zone: Zone | null;
  cardsById: Record<string, Card>;
  viewerId: PlayerId;
  libraryRevealsToAll: LibraryRevealsToAll;
  libraryTopReveal?: LibraryTopRevealMode | null;
}): { cards: Card[]; actualTopCardId: string | null } => {
  if (!params.zone || params.zone.type !== ZONE.LIBRARY) {
    return { cards: [], actualTopCardId: null };
  }
  const zone = params.zone;
  if (zone.ownerId === params.viewerId) {
    return { cards: [], actualTopCardId: null };
  }

  const entries = Object.entries(params.libraryRevealsToAll)
    .map(([cardId, entry]) => ({
      cardId,
      entry,
      ownerId: entry.ownerId ?? params.cardsById[cardId]?.ownerId,
    }))
    .filter((entry) => entry.ownerId === zone.ownerId)
    .sort((a, b) => a.entry.orderKey.localeCompare(b.entry.orderKey));

  const actualTopCardId =
    params.libraryTopReveal === "all" && entries.length
      ? entries[entries.length - 1]?.cardId ?? null
      : null;

  const cards = entries
    .map((entry) =>
      buildLibraryRevealCard({
        cardId: entry.cardId,
        entry: entry.entry,
        zone,
        cardsById: params.cardsById,
      })
    )
    .reverse();

  return { cards, actualTopCardId };
};
