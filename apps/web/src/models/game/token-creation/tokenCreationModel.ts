import type { Card, CardId, PlayerId, ZoneId } from "@/types";
import type { ScryfallCard } from "@/types/scryfall";

import {
  clampNormalizedPosition,
  findAvailablePositionNormalized,
  getNormalizedGridSteps,
} from "@/lib/positions";
import { toScryfallCardLite } from "@/types/scryfallLite";

const DEFAULT_START = { x: 0.5, y: 0.5 };

const getTokenDerivedFields = (token: ScryfallCard) => {
  const frontFace = token.card_faces?.[0];
  const name = frontFace?.name || token.name;
  const power = token.power ?? frontFace?.power;
  const toughness = token.toughness ?? frontFace?.toughness;
  return { name, power, toughness, typeLine: token.type_line };
};

export const planTokenCards = (params: {
  token: ScryfallCard;
  playerId: PlayerId;
  battlefieldZoneId: ZoneId;
  existingBattlefieldCardIds: CardId[];
  cardsById: Record<CardId, Pick<Card, "position">>;
  quantity: number;
  createId: () => string;
}): Card[] => {
  const { name, power, toughness, typeLine } = getTokenDerivedFields(params.token);
  const scryfallLite = toScryfallCardLite(params.token);
  const { stepX, stepY } = getNormalizedGridSteps();

  const occupiedCardIds = [...params.existingBattlefieldCardIds];
  const combinedCardsById: Record<CardId, Pick<Card, "position">> = {
    ...params.cardsById,
  };

  const planned: Card[] = [];

  for (let index = 0; index < params.quantity; index += 1) {
    const id = params.createId();
    const base = clampNormalizedPosition({
      x: DEFAULT_START.x + index * stepX,
      y: DEFAULT_START.y + index * stepY,
    });

    const position = findAvailablePositionNormalized(
      base,
      occupiedCardIds,
      combinedCardsById,
      stepX,
      stepY
    );

    const card: Card = {
      id,
      name,
      typeLine,
      controllerId: params.playerId,
      ownerId: params.playerId,
      zoneId: params.battlefieldZoneId,
      position,
      tapped: false,
      counters: [],
      faceDown: false,
      rotation: 0,
      scryfallId: params.token.id,
      scryfall: scryfallLite,
      currentFaceIndex: 0,
      isToken: true,
      power,
      toughness,
      basePower: power,
      baseToughness: toughness,
    };

    planned.push(card);
    occupiedCardIds.push(id);
    combinedCardsById[id] = { position };
  }

  return planned;
};
