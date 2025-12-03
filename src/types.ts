import { ScryfallCard } from './types/scryfall';

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
// We keep the raw Scryfall payload optional so we can power richer UI (faces, legality, set symbols)
// without forcing it into the core game state when unnecessary.
export interface CardIdentity {
  name: string;
  imageUrl?: string; // Preferred display image (normally Scryfall image_uris.normal)
  oracleText?: string;
  typeLine?: string;
  scryfallId?: string;
  scryfall?: ScryfallCard;
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
  color?: string; // Seat color
  cursor?: { x: number; y: number }; // For multiplayer presence
  counters: Counter[];
  commanderDamage: Record<PlayerId, number>;
  commanderTax: number;
  deckLoaded?: boolean;
}

export interface GameState {
  players: Record<PlayerId, Player>;
  cards: Record<CardId, Card>;
  zones: Record<ZoneId, Zone>;

  // Session
  sessionId: string;
  myPlayerId: PlayerId;
  positionFormat?: 'center' | 'top-left';

  // Counters
  globalCounters: Record<string, string>; // type -> color
  activeModal: { type: 'ADD_COUNTER'; cardId: string } | null;

  // Actions
  addPlayer: (player: Player, isRemote?: boolean) => void;
  updatePlayer: (id: PlayerId, updates: Partial<Player>, actorId?: PlayerId, isRemote?: boolean) => void;
  updateCommanderTax: (playerId: PlayerId, delta: number, isRemote?: boolean) => void;
  addZone: (zone: Zone, isRemote?: boolean) => void;
  addCard: (card: Card, isRemote?: boolean) => void;
  updateCard: (id: CardId, updates: Partial<Card>, actorId?: PlayerId, isRemote?: boolean) => void;
  transformCard: (id: CardId, faceIndex?: number, isRemote?: boolean) => void;
  moveCard: (cardId: CardId, toZoneId: ZoneId, position?: { x: number; y: number }, actorId?: PlayerId, isRemote?: boolean, opts?: { suppressLog?: boolean }) => void;
  moveCardToBottom: (cardId: CardId, toZoneId: ZoneId, actorId?: PlayerId, isRemote?: boolean) => void;
  duplicateCard: (cardId: CardId, actorId?: PlayerId, isRemote?: boolean) => void;
  reorderZoneCards: (zoneId: ZoneId, orderedCardIds: CardId[], actorId?: PlayerId, isRemote?: boolean) => void;
  removeCard: (cardId: CardId, actorId?: PlayerId, isRemote?: boolean) => void;
  tapCard: (cardId: CardId, actorId?: PlayerId, isRemote?: boolean) => void;
  untapAll: (playerId: PlayerId, isRemote?: boolean) => void;
  drawCard: (playerId: PlayerId, actorId?: PlayerId, isRemote?: boolean) => void;
  shuffleLibrary: (playerId: PlayerId, actorId?: PlayerId, isRemote?: boolean) => void;
  resetDeck: (playerId: PlayerId, actorId?: PlayerId, isRemote?: boolean) => void;
  unloadDeck: (playerId: PlayerId, actorId?: PlayerId, isRemote?: boolean) => void;
  setDeckLoaded: (playerId: PlayerId, loaded: boolean, isRemote?: boolean) => void;

  // Counter Actions
  addGlobalCounter: (name: string, color?: string, isRemote?: boolean) => void;
  addCounterToCard: (cardId: CardId, counter: Counter, isRemote?: boolean) => void;
  removeCounterFromCard: (cardId: CardId, counterType: string, isRemote?: boolean) => void;
  setActiveModal: (modal: { type: 'ADD_COUNTER'; cardId: string } | null) => void;

  // Session management
  resetSession: (sessionId?: string) => void;

  // Hydration
  hasHydrated: boolean;
  setHasHydrated: (state: boolean) => void;
}

export type { ScryfallCard, ScryfallIdentifier, ScryfallListResult, ScryfallRelatedCard } from './types/scryfall';
