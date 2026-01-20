import type { Intent, PartyMessage } from "./messages";
import { createIntentSocket } from "./intentSocket";

export type IntentTransport = {
  sendIntent: (intent: Intent) => boolean;
  close: () => void;
  isOpen?: () => boolean;
};

type IntentTransportOptions = {
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

let activeTransport: IntentTransport | null = null;

export const createIntentTransport = ({
  host,
  room,
  token,
  tokenRole,
  playerId,
  viewerRole,
  onMessage,
  onOpen,
  onClose,
  socketOptions,
}: IntentTransportOptions): IntentTransport => {
  const socket = createIntentSocket({
    host,
    room,
    token,
    tokenRole,
    playerId,
    viewerRole,
    onMessage,
    onOpen,
    onClose,
    socketOptions,
  });
  const isOpen = () => socket.readyState === socket.OPEN;

  return {
    sendIntent: (intent) => {
      if (!isOpen()) return false;
      const payload = JSON.stringify({ type: "intent", intent });
      socket.send(payload);
      return true;
    },
    close: () => {
      try {
        socket.close();
      } catch (_err) {}
    },
    isOpen,
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
    if (activeTransport.isOpen && !activeTransport.isOpen()) return false;
    return activeTransport.sendIntent(intent);
  } catch (_err) {
    return false;
  }
};
