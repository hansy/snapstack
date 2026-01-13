import type { CardId, PlayerId, ZoneId } from "./ids";
import type { Counter } from "./counters";
import type { ScryfallCardLite } from "./scryfallLite";

// Metadata that ties a card instance back to a specific printing/source.
// We store only minimal Scryfall data (ScryfallCardLite) for sync efficiency.
// Full Scryfall data is cached locally in IndexedDB and fetched on-demand
// using the scryfallId.
export interface CardIdentity {
  name: string;
  imageUrl?: string; // Preferred display image (normally Scryfall image_uris.normal)
  oracleText?: string;
  typeLine?: string;
  scryfallId?: string;
  scryfall?: ScryfallCardLite; // Minimal data for sync - full data fetched via scryfallCache
  isToken?: boolean;
}

export type FaceDownMode = "morph";

export interface Card extends CardIdentity {
  id: CardId;
  ownerId: PlayerId;
  controllerId: PlayerId;
  zoneId: ZoneId;
  deckSection?: "main" | "sideboard" | "commander";

  // State
  tapped: boolean;
  faceDown: boolean;
  // Optional face-down presentation mode (e.g., morph as 2/2).
  faceDownMode?: FaceDownMode;
  /**
   * Reveal/visibility metadata (best-effort UX only; not cryptographically private).
   *
   * - `knownToAll`: sticky "public knowledge" once the card is face-up in a public zone.
   * - `revealedToAll` / `revealedTo`: explicit reveal from hidden zones (hand/library).
   *
   * Library entry and shuffles clear these fields.
   * Battlefield face-down hides identity from everyone except controller peek.
   */
  knownToAll?: boolean;
  revealedToAll?: boolean;
  revealedTo?: PlayerId[];
  // 0-based index into the Scryfall card_faces array. Defaults to the front face.
  currentFaceIndex?: number;
  isCommander?: boolean;
  commanderTax?: number;
  // Center position relative to the zone (logical/unscaled units)
  position: { x: number; y: number };
  rotation: number; // Degrees
  counters: Counter[];

  // Power/Toughness
  power?: string;
  toughness?: string;
  basePower?: string;
  baseToughness?: string;
  customText?: string;
}

export type TokenCard = Card & { isToken: true };

export const isTokenCard = (card: Card): card is TokenCard => card.isToken === true;
