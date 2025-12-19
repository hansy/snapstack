import type { Card, PlayerId, Zone } from "@/types";
import type { ScryfallCard, ScryfallRelatedCard } from "@/types/scryfall";

import { ZONE } from "@/constants/zones";
import {
  clampNormalizedPosition,
  findAvailablePositionNormalized,
  GRID_STEP_X,
  GRID_STEP_Y,
  migratePositionToNormalized,
} from "@/lib/positions";
import { toScryfallCardLite } from "@/types/scryfallLite";

const normalizeMaybeLegacyPosition = (position: { x: number; y: number }) =>
  position.x > 1 || position.y > 1 ? migratePositionToNormalized(position) : position;

export const isScryfallTokenCard = (params: {
  related: ScryfallRelatedCard;
  card: Pick<ScryfallCard, "layout" | "type_line">;
}): boolean => {
  return (
    params.related.component === "token" ||
    params.card.layout === "token" ||
    /token/i.test(params.card.type_line ?? "")
  );
};

export const buildRelatedBattlefieldCard = (params: {
  sourceCard: Pick<Card, "position">;
  battlefield: Pick<Zone, "id" | "type" | "cardIds">;
  playerId: PlayerId;
  related: ScryfallRelatedCard;
  scryfallCard: ScryfallCard;
  cardsById: Record<string, Pick<Card, "position">>;
  createId: () => string;
}): Card | null => {
  if (params.battlefield.type !== ZONE.BATTLEFIELD) return null;

  const frontFace = params.scryfallCard.card_faces?.[0];
  const name = frontFace?.name || params.scryfallCard.name || params.related.name;
  const power = params.scryfallCard.power ?? frontFace?.power;
  const toughness = params.scryfallCard.toughness ?? frontFace?.toughness;

  const sourcePosition = normalizeMaybeLegacyPosition(params.sourceCard.position);
  const basePosition = clampNormalizedPosition({
    x: sourcePosition.x + GRID_STEP_X,
    y: sourcePosition.y + GRID_STEP_Y,
  });

  const position = findAvailablePositionNormalized(
    basePosition,
    params.battlefield.cardIds,
    params.cardsById
  );

  const isToken = isScryfallTokenCard({
    related: params.related,
    card: params.scryfallCard,
  });

  return {
    id: params.createId(),
    ownerId: params.playerId,
    controllerId: params.playerId,
    zoneId: params.battlefield.id,
    name,
    typeLine: params.scryfallCard.type_line,
    scryfallId: params.scryfallCard.id,
    scryfall: toScryfallCardLite(params.scryfallCard),
    tapped: false,
    faceDown: false,
    currentFaceIndex: 0,
    rotation: 0,
    counters: [],
    position,
    isToken,
    power,
    toughness,
    basePower: power,
    baseToughness: toughness,
  };
};

