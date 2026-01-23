import type { Card, FaceDownMode } from "./cards";
import type { Counter } from "./counters";
import type { Player } from "./players";
import type { CardId, PlayerId, ViewerRole, ZoneId } from "./ids";
import type { Zone } from "./zones";
import type {
  FaceDownRevealsToAll,
  HandRevealsToAll,
  LibraryRevealsToAll,
} from "./reveals";
import type {
  PrivateOverlayDiffPayload,
  PrivateOverlayPayload,
  RoomTokensPayload,
} from "@/partykit/messages";

export interface GameState {
  viewerRole: ViewerRole;
  players: Record<PlayerId, Player>;
  playerOrder: PlayerId[];
  cards: Record<CardId, Card>;
  zones: Record<ZoneId, Zone>;
  handRevealsToAll: HandRevealsToAll;
  libraryRevealsToAll: LibraryRevealsToAll;
  faceDownRevealsToAll: FaceDownRevealsToAll;
  battlefieldViewScale: Record<PlayerId, number>;
  roomHostId: PlayerId | null;
  roomLockedByHost: boolean;
  roomOverCapacity: boolean;
  privateOverlay: PrivateOverlayPayload | null;
  overlayCapabilities: string[];
  roomTokens: RoomTokensPayload | null;

  // Session
  sessionId: string;
  myPlayerId: PlayerId;
  positionFormat?: "center" | "top-left" | "normalized";

  // Counters
  globalCounters: Record<string, string>; // type -> color
  activeModal: { type: "ADD_COUNTER"; cardIds: string[] } | null;

  // Actions
  addPlayer: (player: Player, isRemote?: boolean) => void;
  updatePlayer: (
    id: PlayerId,
    updates: Partial<Player>,
    actorId?: PlayerId,
    isRemote?: boolean
  ) => void;
  addZone: (zone: Zone, isRemote?: boolean) => void;
  addCard: (card: Card, isRemote?: boolean) => void;
  addCards: (cards: Card[], isRemote?: boolean) => void;
  updateCard: (
    id: CardId,
    updates: Partial<Card>,
    actorId?: PlayerId,
    isRemote?: boolean
  ) => void;
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
      faceDownMode?: FaceDownMode;
      skipCollision?: boolean;
      groupCollision?: {
        movingCardIds: CardId[];
        targetPositions: Record<
          CardId,
          { x: number; y: number } | undefined
        >;
      };
    }
  ) => void;
  moveCardToBottom: (
    cardId: CardId,
    toZoneId: ZoneId,
    actorId?: PlayerId,
    isRemote?: boolean
  ) => void;
  duplicateCard: (
    cardId: CardId,
    actorId?: PlayerId,
    isRemote?: boolean
  ) => void;
  reorderZoneCards: (
    zoneId: ZoneId,
    orderedCardIds: CardId[],
    actorId?: PlayerId,
    isRemote?: boolean
  ) => void;
  removeCard: (
    cardId: CardId,
    actorId?: PlayerId,
    isRemote?: boolean
  ) => void;
  tapCard: (cardId: CardId, actorId?: PlayerId, isRemote?: boolean) => void;
  untapAll: (playerId: PlayerId, isRemote?: boolean) => void;
  drawCard: (
    playerId: PlayerId,
    actorId?: PlayerId,
    isRemote?: boolean
  ) => void;
  discardFromLibrary: (
    playerId: PlayerId,
    count?: number,
    actorId?: PlayerId,
    isRemote?: boolean
  ) => void;
  shuffleLibrary: (
    playerId: PlayerId,
    actorId?: PlayerId,
    isRemote?: boolean
  ) => void;
  mulligan: (
    playerId: PlayerId,
    count: number,
    actorId?: PlayerId,
    isRemote?: boolean
  ) => void;
  setCardReveal: (
    cardId: CardId,
    reveal: { toAll?: boolean; to?: PlayerId[] } | null,
    actorId?: PlayerId,
    isRemote?: boolean
  ) => void;
  resetDeck: (
    playerId: PlayerId,
    actorId?: PlayerId,
    isRemote?: boolean
  ) => void;
  unloadDeck: (
    playerId: PlayerId,
    actorId?: PlayerId,
    isRemote?: boolean
  ) => void;
  setDeckLoaded: (
    playerId: PlayerId,
    loaded: boolean,
    isRemote?: boolean
  ) => void;
  setRoomLockedByHost: (locked: boolean) => void;

  // Counter Actions
  addGlobalCounter: (name: string, color?: string, isRemote?: boolean) => void;
  addCounterToCard: (
    cardId: CardId,
    counter: Counter,
    actorId?: PlayerId,
    isRemote?: boolean
  ) => void;
  removeCounterFromCard: (
    cardId: CardId,
    counterType: string,
    actorId?: PlayerId,
    isRemote?: boolean
  ) => void;
  setActiveModal: (modal: { type: "ADD_COUNTER"; cardIds: string[] } | null) => void;

  // Session management
  playerIdsBySession: Record<string, PlayerId>;
  sessionVersions: Record<string, number>;
  resetSession: (sessionId?: string, playerId?: string) => void;
  ensurePlayerIdForSession: (sessionId: string) => string;
  forgetSessionIdentity: (sessionId: string) => void;
  ensureSessionVersion: (sessionId: string) => number;
  leaveGame: () => void;
  setBattlefieldViewScale: (playerId: PlayerId, scale: number) => void;
  setViewerRole: (role: ViewerRole) => void;
  applyPrivateOverlay: (overlay: PrivateOverlayPayload) => void;
  applyPrivateOverlayDiff: (diff: PrivateOverlayDiffPayload) => boolean;
  setOverlayCapabilities: (capabilities: string[]) => void;
  setRoomTokens: (tokens: RoomTokensPayload | null) => void;

  // Hydration
  hasHydrated: boolean;
  setHasHydrated: (state: boolean) => void;
}
