import type { Card, Player, PlayerId, Zone } from "@/types";

import { ZONE } from "@/constants/zones";
import { canViewerSeeCardIdentity } from "@/lib/reveal";

export const resolveZoneOwnerName = (params: {
  zone: Pick<Zone, "ownerId"> | null;
  players: Record<PlayerId, Pick<Player, "name">>;
}): string => {
  if (!params.zone) return "";
  return params.players[params.zone.ownerId]?.name ?? params.zone.ownerId;
};

export const computeRevealedOpponentLibraryCardIds = (params: {
  zone: Zone | null;
  cardsById: Record<string, Card>;
  viewerId: PlayerId;
}): string[] => {
  if (!params.zone || params.zone.type !== ZONE.LIBRARY) return [];
  if (params.zone.ownerId === params.viewerId) return [];

  // zone.cardIds is [bottom..top]; show top-first, preserving relative order.
  const visible = params.zone.cardIds.filter((id) => {
    const card = params.cardsById[id];
    if (!card) return false;
    return canViewerSeeCardIdentity(card, ZONE.LIBRARY, params.viewerId);
  });
  return visible.reverse();
};

export const getLibraryTopCardId = (zone: Zone | null): string | null => {
  if (!zone || zone.type !== ZONE.LIBRARY) return null;
  return zone.cardIds.length ? zone.cardIds[zone.cardIds.length - 1] : null;
};
