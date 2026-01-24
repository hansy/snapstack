import type { CardId, PlayerId, ZoneId } from "./ids";

export type ZoneType =
  | "library"
  | "hand"
  | "battlefield"
  | "graveyard"
  | "exile"
  | "commander"
  | "sideboard";

export interface Zone {
  id: ZoneId;
  type: ZoneType;
  ownerId: PlayerId;
  cardIds: CardId[]; // Ordered list of cards in this zone
}
