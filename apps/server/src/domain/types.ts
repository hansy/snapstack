import type * as Y from "yjs";

import type {
  Card,
  CardIdentity,
  CardLite,
  FaceDownMode,
} from "../../../web/src/types/cards";
import type { Player } from "../../../web/src/types/players";
import type { Zone, ZoneType } from "../../../web/src/types/zones";

export type Maps = {
  players: Y.Map<unknown>;
  playerOrder: Y.Array<string>;
  zones: Y.Map<unknown>;
  cards: Y.Map<unknown>;
  zoneCardOrders: Y.Map<Y.Array<string>>;
  globalCounters: Y.Map<unknown>;
  battlefieldViewScale: Y.Map<unknown>;
  meta: Y.Map<unknown>;
  handRevealsToAll: Y.Map<unknown>;
  libraryRevealsToAll: Y.Map<unknown>;
  faceDownRevealsToAll: Y.Map<unknown>;
};

export type Snapshot = {
  players: Record<string, Player>;
  playerOrder: string[];
  zones: Record<string, Zone>;
  cards: Record<string, Card>;
  globalCounters: Record<string, string>;
  battlefieldViewScale: Record<string, number>;
  meta: Record<string, unknown>;
};

export type HiddenReveal = {
  toAll?: boolean;
  toPlayers?: string[];
};

export type HiddenState = {
  cards: Record<string, Card>;
  handOrder: Record<string, string[]>;
  libraryOrder: Record<string, string[]>;
  sideboardOrder: Record<string, string[]>;
  faceDownBattlefield: Record<string, CardIdentity>;
  handReveals: Record<string, HiddenReveal>;
  libraryReveals: Record<string, HiddenReveal>;
  faceDownReveals: Record<string, HiddenReveal>;
};

export type HiddenStateMeta = Omit<HiddenState, "cards"> & { cardChunkKeys: string[] };

export type RoomTokens = {
  playerToken: string;
  spectatorToken: string;
};

export type Intent = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
};

export type IntentConnectionState = {
  playerId?: string;
  viewerRole?: "player" | "spectator";
  token?: string;
};

export type OverlayMeta = {
  cardCount: number;
  cardsWithArt: number;
  viewerHandCount: number;
};

export type OverlaySnapshotData = {
  cards: CardLite[];
  zoneCardOrders?: Record<string, string[]>;
};

export type PrivateOverlayPayload = {
  schemaVersion: number;
  overlayVersion: number;
  roomId: string;
  viewerId?: string;
  cards: CardLite[];
  zoneCardOrders?: Record<string, string[]>;
  zoneCardOrderVersions?: Record<string, number>;
  meta?: OverlayMeta;
};

export type PrivateOverlayDiffPayload = {
  schemaVersion: number;
  overlayVersion: number;
  baseOverlayVersion: number;
  roomId: string;
  viewerId?: string;
  upserts: CardLite[];
  removes: string[];
  zoneCardOrders?: Record<string, string[]>;
  zoneOrderRemovals?: string[];
  zoneCardOrderVersions?: Record<string, number>;
  meta?: OverlayMeta;
};

export type LogEvent = { eventId: string; payload: Record<string, unknown> };

export type IntentImpact = {
  changedOwners: string[];
  changedZones: string[];
  changedRevealScopes: { toAll: boolean; toPlayers: string[] };
  changedPublicDoc: boolean;
};

export type ApplyResult =
  | { ok: true; logEvents: LogEvent[]; hiddenChanged?: boolean; impact?: IntentImpact }
  | { ok: false; error: string };

export type InnerApplyResult = { ok: true } | { ok: false; error: string };

export type MoveOpts = {
  suppressLog?: boolean;
  faceDown?: boolean;
  faceDownMode?: FaceDownMode;
  skipCollision?: boolean;
  groupCollision?: {
    movingCardIds: string[];
    targetPositions: Record<string, { x: number; y: number } | undefined>;
  };
};

export type FaceDownMoveResolution = {
  effectiveFaceDown: boolean;
  patchFaceDown?: boolean;
  effectiveFaceDownMode?: FaceDownMode;
  patchFaceDownMode?: FaceDownMode | null;
};

export type PermissionResult = { allowed: boolean; reason?: string };

export type RevealPatch = Pick<Card, "knownToAll" | "revealedToAll" | "revealedTo"> | null;

export type CardUpdatePayload = Record<string, unknown>;

export type ZoneLike = { type: ZoneType } | null | undefined;
