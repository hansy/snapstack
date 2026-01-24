import type { Intent, PartyMessage } from "./messages";
import { createIntentSocket } from "./intentSocket";

export type IntentTransport = {
  sendIntent: (intent: Intent) => boolean;
  sendMessage: (message: unknown) => boolean;
  close: () => void;
  isOpen?: () => boolean;
  connect?: () => void;
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
  const connect = () => {
    if (typeof (socket as any).reconnect !== "function") return;
    if (socket.readyState === socket.OPEN || socket.readyState === socket.CONNECTING) {
      return;
    }
    (socket as any).reconnect();
  };

  return {
    sendIntent: (intent) => {
      if (!isOpen()) return false;
      const payload = JSON.stringify({ type: "intent", intent });
      socket.send(payload);
      return true;
    },
    sendMessage: (message) => {
      if (!isOpen()) return false;
      socket.send(JSON.stringify(message));
      return true;
    },
    close: () => {
      try {
        socket.close();
      } catch (_err) {}
    },
    isOpen,
    connect,
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

export const sendPartyMessage = (message: unknown): boolean => {
  if (!activeTransport) return false;
  try {
    if (activeTransport.isOpen && !activeTransport.isOpen()) return false;
    return activeTransport.sendMessage(message);
  } catch (_err) {
    return false;
  }
};
