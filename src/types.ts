export type PlayerId = string;
export type CardId = string;
export type ZoneId = string;

export type CounterType = 'p1p1' | 'm1m1' | 'loyalty' | 'charge' | 'energy' | 'poison' | 'commander' | string;

export interface Counter {
  type: CounterType;
  count: number;
  color?: string; // Hex code for custom counters
}

export interface Card {
  id: CardId;
  ownerId: PlayerId;
  controllerId: PlayerId;
  zoneId: ZoneId;
  name: string;
  imageUrl?: string; // Scryfall image URL
  oracleText?: string;
  typeLine?: string;

  // State
  tapped: boolean;
  faceDown: boolean;
  // Center position relative to the zone (logical/unscaled units)
  position: { x: number; y: number };
  rotation: number; // Degrees
  counters: Counter[];

  // Metadata
  scryfallId?: string;
}

export type ZoneType = 'library' | 'hand' | 'battlefield' | 'graveyard' | 'exile' | 'command';

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
  tapCard: (cardId: CardId, isRemote?: boolean) => void;
  untapAll: (playerId: PlayerId, isRemote?: boolean) => void;
  drawCard: (playerId: PlayerId, isRemote?: boolean) => void;
  shuffleLibrary: (playerId: PlayerId, isRemote?: boolean) => void;
  setDeckLoaded: (playerId: PlayerId, loaded: boolean, isRemote?: boolean) => void;

  // Hydration
  hasHydrated: boolean;
  setHasHydrated: (state: boolean) => void;
}
