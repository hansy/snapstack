import type { Intent, PartyMessage } from "./messages";
import { createIntentSocket } from "./intentSocket";

export type IntentTransport = {
  sendIntent: (intent: Intent) => boolean;
  sendMessage: (message: unknown) => boolean;
  close: () => void;
  isOpen?: () => boolean;
  connect?: () => void;
};

export type IntentConnectionMeta = {
  isOpen: boolean;
  everConnected: boolean;
  lastOpenAt: number | null;
  lastCloseAt: number | null;
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
const initialIntentMeta = (): IntentConnectionMeta => ({
  isOpen: false,
  everConnected: false,
  lastOpenAt: null,
  lastCloseAt: null,
});
let activeIntentMeta: IntentConnectionMeta = initialIntentMeta();
const syncIntentMeta = () => {
  if (!activeTransport?.isOpen) return;
  const isOpen = activeTransport.isOpen();
  if (isOpen === activeIntentMeta.isOpen) return;
  if (isOpen) {
    activeIntentMeta.isOpen = true;
    activeIntentMeta.everConnected = true;
    activeIntentMeta.lastOpenAt = Date.now();
  } else {
    activeIntentMeta.isOpen = false;
    activeIntentMeta.lastCloseAt = Date.now();
  }
};

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
  let transport: IntentTransport | null = null;
  const handleOpen = () => {
    if (transport && activeTransport === transport) {
      activeIntentMeta.isOpen = true;
      activeIntentMeta.everConnected = true;
      activeIntentMeta.lastOpenAt = Date.now();
    }
    onOpen?.();
  };
  const handleClose = (event: CloseEvent) => {
    if (transport && activeTransport === transport) {
      activeIntentMeta.isOpen = false;
      activeIntentMeta.lastCloseAt = Date.now();
    }
    onClose?.(event);
  };

  const socket = createIntentSocket({
    host,
    room,
    token,
    tokenRole,
    playerId,
    viewerRole,
    onMessage,
    onOpen: handleOpen,
    onClose: handleClose,
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

  transport = {
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

  return transport;
};

export const setIntentTransport = (transport: IntentTransport | null) => {
  if (activeTransport && activeTransport !== transport) {
    activeTransport.close();
  }
  activeTransport = transport;
  activeIntentMeta = initialIntentMeta();
  if (activeTransport?.isOpen && activeTransport.isOpen()) {
    activeIntentMeta.isOpen = true;
    activeIntentMeta.everConnected = true;
    activeIntentMeta.lastOpenAt = Date.now();
  }
};

export const clearIntentTransport = () => {
  if (activeTransport) {
    activeTransport.close();
  }
  activeTransport = null;
  activeIntentMeta = initialIntentMeta();
};

export const getIntentConnectionMeta = (): IntentConnectionMeta => {
  syncIntentMeta();
  return { ...activeIntentMeta };
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
