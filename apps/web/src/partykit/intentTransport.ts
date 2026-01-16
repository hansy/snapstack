import type { Intent, PartyMessage } from "./messages";
import { createIntentSocket } from "./intentSocket";

export type IntentTransport = {
  sendIntent: (intent: Intent) => void;
  close: () => void;
};

type IntentTransportOptions = {
  host: string;
  room: string;
  token?: string;
  playerId?: string;
  viewerRole?: "player" | "spectator";
  onMessage?: (message: PartyMessage) => void;
  onOpen?: () => void;
  onClose?: (event: CloseEvent) => void;
};

let activeTransport: IntentTransport | null = null;

export const createIntentTransport = ({
  host,
  room,
  token,
  playerId,
  viewerRole,
  onMessage,
  onOpen,
  onClose,
}: IntentTransportOptions): IntentTransport => {
  const socket = createIntentSocket({
    host,
    room,
    token,
    playerId,
    viewerRole,
    onMessage,
    onOpen,
    onClose,
  });

  return {
    sendIntent: (intent) => {
      const payload = JSON.stringify({ type: "intent", intent });
      socket.send(payload);
    },
    close: () => {
      try {
        socket.close();
      } catch (_err) {}
    },
  };
};

export const setIntentTransport = (transport: IntentTransport | null) => {
  if (activeTransport && activeTransport !== transport) {
    activeTransport.close();
  }
  activeTransport = transport;
};

export const clearIntentTransport = () => {
  if (activeTransport) {
    activeTransport.close();
  }
  activeTransport = null;
};

export const sendIntent = (intent: Intent): boolean => {
  if (!activeTransport) return false;
  try {
    activeTransport.sendIntent(intent);
    return true;
  } catch (_err) {
    return false;
  }
};
