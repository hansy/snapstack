import type { Card } from "@/types";

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
  | LogEventMessage
  | RoomTokensMessage;

export type PrivateOverlayPayload = {
  cards: Card[];
  zoneCardOrders?: Record<string, string[]>;
};
