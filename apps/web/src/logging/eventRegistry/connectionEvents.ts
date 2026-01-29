import type { LogEventDefinition } from "../types";
import type { BackoffReason } from "@/hooks/game/multiplayer-sync/connectionBackoff";

export type ConnectionReconnectPayload = {
  reason: BackoffReason;
  attempt: number;
  delayMs: number;
};

export type ConnectionReconnectAbandonedPayload = {
  attempt: number;
};

export type ConnectionAuthFailurePayload = {
  reason?: string | null;
};

const formatDelay = (delayMs: number) => {
  if (delayMs < 1000) return `${delayMs}ms`;
  const seconds = Math.round(delayMs / 100) / 10;
  return `${seconds}`.replace(/\.0$/, "") + "s";
};

const formatReconnectReason = (reason: BackoffReason) => {
  switch (reason) {
    case "room-reset":
      return "room reset";
    case "resume":
      return "resume";
    case "rate-limit":
      return "rate limited";
    case "join-token":
      return "join token unavailable";
    case "close":
    default:
      return "connection closed";
  }
};

export const connectionEvents: Record<
  "connection.reconnect" | "connection.reconnectAbandoned" | "connection.authFailure",
  LogEventDefinition<any>
> = {
  "connection.reconnect": {
    format: (payload: ConnectionReconnectPayload) => [{
      kind: "text",
      text: `Reconnecting after ${formatReconnectReason(payload.reason)} (attempt ${payload.attempt}) in ${formatDelay(payload.delayMs)}`,
    }],
  },
  "connection.reconnectAbandoned": {
    format: (payload: ConnectionReconnectAbandonedPayload) => [{
      kind: "text",
      text: `Stopped reconnecting after ${payload.attempt} attempts`,
    }],
  },
  "connection.authFailure": {
    format: (payload: ConnectionAuthFailurePayload) => [{
      kind: "text",
      text: payload.reason
        ? `Connection auth failed (${payload.reason})`
        : "Connection auth failed",
    }],
  },
};
