import PartySocket from "partysocket";

import type { PartyMessage } from "./messages";

export type IntentSocketOptions = {
  host: string;
  room: string;
  token?: string;
  playerId?: string;
  viewerRole?: "player" | "spectator";
  onMessage?: (message: PartyMessage) => void;
  onOpen?: () => void;
  onClose?: (event: CloseEvent) => void;
};

export const createIntentSocket = ({
  host,
  room,
  token,
  playerId,
  viewerRole,
  onMessage,
  onOpen,
  onClose,
}: IntentSocketOptions) => {
  const tokenParam =
    token && viewerRole === "spectator" ? { st: token } : token ? { gt: token } : {};
  const socket = new PartySocket({
    host,
    room,
    query: {
      role: "intent",
      ...tokenParam,
      ...(playerId ? { playerId } : {}),
      ...(viewerRole ? { viewerRole } : {}),
    },
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
