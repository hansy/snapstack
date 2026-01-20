import PartySocket from "partysocket";

import type { PartyMessage } from "./messages";
import { PARTY_NAME } from "./config";

export type IntentSocketOptions = {
  host: string;
  room: string;
  token?: string;
  tokenRole?: "player" | "spectator";
  playerId?: string;
  viewerRole?: "player" | "spectator";
  onMessage?: (message: PartyMessage) => void;
  onOpen?: () => void;
  onClose?: (event: CloseEvent) => void;
  socketOptions?: {
    maxReconnectionDelay?: number;
    minReconnectionDelay?: number;
    reconnectionDelayGrowFactor?: number;
    minUptime?: number;
    connectionTimeout?: number;
    maxRetries?: number;
    maxEnqueuedMessages?: number;
    startClosed?: boolean;
    debug?: boolean;
    debugLogger?: (...args: unknown[]) => void;
  };
};

export const createIntentSocket = ({
  host,
  room,
  token,
  playerId,
  viewerRole,
  tokenRole,
  onMessage,
  onOpen,
  onClose,
  socketOptions,
}: IntentSocketOptions) => {
  const tokenParam =
    token && tokenRole === "spectator"
      ? { st: token }
      : token && tokenRole === "player"
        ? { gt: token }
        : token && viewerRole === "spectator"
          ? { st: token }
          : token
            ? { gt: token }
            : {};
  const socket = new PartySocket({
    host,
    room,
    party: PARTY_NAME,
    query: {
      role: "intent",
      ...tokenParam,
      ...(playerId ? { playerId } : {}),
      ...(viewerRole ? { viewerRole } : {}),
    },
    ...(socketOptions ?? {}),
  });

  if (onOpen) socket.onopen = () => onOpen();
  if (onClose) socket.onclose = (event) => onClose(event);
  if (onMessage) {
    socket.onmessage = (event) => {
      if (typeof event.data !== "string") return;
      try {
        const parsed = JSON.parse(event.data) as PartyMessage;
        onMessage(parsed);
      } catch (_err) {
        // Ignore malformed messages until server emits structured data.
      }
    };
  }

  return socket;
};
