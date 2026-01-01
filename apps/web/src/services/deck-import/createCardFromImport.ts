import { v4 as uuidv4 } from "uuid";
import type { Card, PlayerId, ZoneId } from "@/types";

export const createCardFromImport = (
  cardData: Partial<Card>,
  ownerId: PlayerId,
  zoneId: ZoneId
): Card => {
  const deckSection = (cardData as { deckSection?: Card["deckSection"]; section?: string }).deckSection ??
    (cardData as { section?: string }).section;
  return {
    id: uuidv4(),
    ownerId,
    controllerId: ownerId,
    zoneId,
    name: cardData.name || "Unknown Card",
    imageUrl: cardData.imageUrl,
    typeLine: cardData.typeLine,
    oracleText: cardData.oracleText,
    scryfallId: cardData.scryfallId,
    tapped: false,
    faceDown: false,
    rotation: 0,
    counters: [],
    position: { x: 0, y: 0 },
    ...cardData,
    deckSection: deckSection as Card["deckSection"],
    currentFaceIndex: cardData.currentFaceIndex ?? 0,
  };
};

