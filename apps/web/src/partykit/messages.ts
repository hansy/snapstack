import type { CardLite } from "@/types";

export type Intent = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
};

export type IntentMessage = {
  type: "intent";
  intent: Intent;
};

export type IntentAck = {
  type: "ack";
  intentId: string;
  ok: boolean;
  error?: string;
};

export type PrivateOverlayMessage = {
  type: "privateOverlay";
  payload: PrivateOverlayPayload;
};

export type PrivateOverlayDiffMessage = {
  type: "privateOverlayDiff";
  payload: PrivateOverlayDiffPayload;
};

export type HelloAckMessage = {
  type: "helloAck";
  payload: {
    acceptedCapabilities: string[];
  };
};

export type LogEventMessage = {
  type: "logEvent";
  eventId: string;
  payload: Record<string, unknown>;
};

export type RoomTokensPayload = {
  playerToken?: string;
  spectatorToken?: string;
};

export type RoomTokensMessage = {
  type: "roomTokens";
  payload: RoomTokensPayload;
};

export type PartyMessage =
  | IntentMessage
  | IntentAck
  | PrivateOverlayMessage
  | PrivateOverlayDiffMessage
  | HelloAckMessage
  | LogEventMessage
  | RoomTokensMessage;

export type OverlayMeta = {
  cardCount: number;
  cardsWithArt: number;
  viewerHandCount: number;
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

export type ClientHelloMessage = {
  type: "hello";
  payload: {
    capabilities: string[];
  };
};

export type OverlayResyncMessage = {
  type: "overlayResync";
  payload?: {
    reason?: string;
    lastOverlayVersion?: number;
  };
};
