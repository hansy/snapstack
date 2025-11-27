import { ScryfallCard } from './types/scryfall';

export type PlayerId = string;
export type CardId = string;
export type ZoneId = string;

export type CounterType = 'p1p1' | 'm1m1' | 'loyalty' | 'charge' | 'energy' | 'poison' | 'commander' | string;

export interface Counter {
  type: CounterType;
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
}

export interface Card extends CardIdentity {
  id: CardId;
  ownerId: PlayerId;
  controllerId: PlayerId;
  zoneId: ZoneId;

  // State
  tapped: boolean;
  faceDown: boolean;
  // Center position relative to the zone (logical/unscaled units)
  position: { x: number; y: number };
  rotation: number; // Degrees
  counters: Counter[];
}

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

  // Actions
  addPlayer: (player: Player, isRemote?: boolean) => void;
  updatePlayer: (id: PlayerId, updates: Partial<Player>, isRemote?: boolean) => void;
  addZone: (zone: Zone, isRemote?: boolean) => void;
  addCard: (card: Card, isRemote?: boolean) => void;
  updateCard: (id: CardId, updates: Partial<Card>, isRemote?: boolean) => void;
  moveCard: (cardId: CardId, toZoneId: ZoneId, position?: { x: number; y: number }, isRemote?: boolean) => void;
  moveCardToBottom: (cardId: CardId, toZoneId: ZoneId, isRemote?: boolean) => void;
  tapCard: (cardId: CardId, isRemote?: boolean) => void;
  untapAll: (playerId: PlayerId, isRemote?: boolean) => void;
  drawCard: (playerId: PlayerId, isRemote?: boolean) => void;
  shuffleLibrary: (playerId: PlayerId, isRemote?: boolean) => void;
  setDeckLoaded: (playerId: PlayerId, loaded: boolean, isRemote?: boolean) => void;

  // Hydration
  hasHydrated: boolean;
  setHasHydrated: (state: boolean) => void;
}

export type { ScryfallCard, ScryfallIdentifier } from './types/scryfall';
