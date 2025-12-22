import { ScryfallCardLite } from './scryfallLite';

export type PlayerId = string;
export type CardId = string;
export type ZoneId = string;

export type CounterType = 'p1p1' | 'm1m1' | 'loyalty' | 'charge' | 'energy' | 'poison' | 'commander' | string;

export interface Counter {
  type: string;
  count: number;
  color?: string; // Hex code for custom counters
}

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

export interface Card extends CardIdentity {
  id: CardId;
  ownerId: PlayerId;
  controllerId: PlayerId;
  zoneId: ZoneId;

  // State
  tapped: boolean;
  faceDown: boolean;
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

export type ZoneType = 'library' | 'hand' | 'battlefield' | 'graveyard' | 'exile' | 'commander';

export interface Zone {
  id: ZoneId;
  type: ZoneType;
  ownerId: PlayerId;
  cardIds: CardId[]; // Ordered list of cards in this zone
}

export interface Player {
  id: PlayerId;
  name: string;
  life: number;
  color?: string; // Player identity color (shared across clients)
  cursor?: { x: number; y: number }; // For multiplayer presence
  counters: Counter[];
  commanderDamage: Record<PlayerId, number>;
  commanderTax: number;
  deckLoaded?: boolean;
}

export interface GameState {
  players: Record<PlayerId, Player>;
  playerOrder: PlayerId[];
  cards: Record<CardId, Card>;
  zones: Record<ZoneId, Zone>;
  battlefieldViewScale: Record<PlayerId, number>;

  // Session
  sessionId: string;
  myPlayerId: PlayerId;
  positionFormat?: 'center' | 'top-left' | 'normalized';

  // Counters
  globalCounters: Record<string, string>; // type -> color
  activeModal: { type: 'ADD_COUNTER'; cardIds: string[] } | null;

  // Actions
  addPlayer: (player: Player, isRemote?: boolean) => void;
  updatePlayer: (id: PlayerId, updates: Partial<Player>, actorId?: PlayerId, isRemote?: boolean) => void;
  updateCommanderTax: (playerId: PlayerId, delta: number, actorId?: PlayerId, isRemote?: boolean) => void;
  addZone: (zone: Zone, isRemote?: boolean) => void;
  addCard: (card: Card, isRemote?: boolean) => void;
  updateCard: (id: CardId, updates: Partial<Card>, actorId?: PlayerId, isRemote?: boolean) => void;
  transformCard: (id: CardId, faceIndex?: number, isRemote?: boolean) => void;
  moveCard: (
    cardId: CardId,
    toZoneId: ZoneId,
    position?: { x: number; y: number },
    actorId?: PlayerId,
    isRemote?: boolean,
    opts?: {
      suppressLog?: boolean;
      faceDown?: boolean;
      skipCollision?: boolean;
      groupCollision?: {
        movingCardIds: CardId[];
        targetPositions: Record<CardId, { x: number; y: number } | undefined>;
      };
    }
  ) => void;
  moveCardToBottom: (cardId: CardId, toZoneId: ZoneId, actorId?: PlayerId, isRemote?: boolean) => void;
  duplicateCard: (cardId: CardId, actorId?: PlayerId, isRemote?: boolean) => void;
  reorderZoneCards: (zoneId: ZoneId, orderedCardIds: CardId[], actorId?: PlayerId, isRemote?: boolean) => void;
  removeCard: (cardId: CardId, actorId?: PlayerId, isRemote?: boolean) => void;
  tapCard: (cardId: CardId, actorId?: PlayerId, isRemote?: boolean) => void;
  untapAll: (playerId: PlayerId, isRemote?: boolean) => void;
  drawCard: (playerId: PlayerId, actorId?: PlayerId, isRemote?: boolean) => void;
  shuffleLibrary: (playerId: PlayerId, actorId?: PlayerId, isRemote?: boolean) => void;
  setCardReveal: (
    cardId: CardId,
    reveal:
      | { toAll?: boolean; to?: PlayerId[] }
      | null,
    actorId?: PlayerId,
    isRemote?: boolean
  ) => void;
  resetDeck: (playerId: PlayerId, actorId?: PlayerId, isRemote?: boolean) => void;
  unloadDeck: (playerId: PlayerId, actorId?: PlayerId, isRemote?: boolean) => void;
  setDeckLoaded: (playerId: PlayerId, loaded: boolean, isRemote?: boolean) => void;

  // Counter Actions
  addGlobalCounter: (name: string, color?: string, isRemote?: boolean) => void;
  addCounterToCard: (cardId: CardId, counter: Counter, actorId?: PlayerId, isRemote?: boolean) => void;
  removeCounterFromCard: (cardId: CardId, counterType: string, actorId?: PlayerId, isRemote?: boolean) => void;
  setActiveModal: (modal: { type: 'ADD_COUNTER'; cardIds: string[] } | null) => void;

  // Session management
  playerIdsBySession: Record<string, PlayerId>;
  sessionVersions: Record<string, number>;
  resetSession: (sessionId?: string, playerId?: string) => void;
  ensurePlayerIdForSession: (sessionId: string) => string;
  forgetSessionIdentity: (sessionId: string) => void;
  ensureSessionVersion: (sessionId: string) => number;
  leaveGame: () => void;
  setBattlefieldViewScale: (playerId: PlayerId, scale: number) => void;

  // Hydration
  hasHydrated: boolean;
  setHasHydrated: (state: boolean) => void;
}

export type { ScryfallCard, ScryfallIdentifier, ScryfallListResult, ScryfallRelatedCard } from './scryfall';
export type { ScryfallCardLite, ScryfallCardFaceLite, ScryfallImageUrisLite } from './scryfallLite';
export { toScryfallCardLite } from './scryfallLite';
