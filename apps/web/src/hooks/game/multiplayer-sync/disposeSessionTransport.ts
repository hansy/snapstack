import type { Awareness } from "y-protocols/awareness";
import type { WebsocketProvider } from "y-websocket";

export type SessionTransport = {
  provider: WebsocketProvider;
  awareness: Awareness;
};

export type DisposeSessionTransportDeps = {
  getSessionProvider: (sessionId: string) => WebsocketProvider | null;
  setSessionProvider: (sessionId: string, provider: WebsocketProvider | null) => void;
  getSessionAwareness: (sessionId: string) => Awareness | null;
  setSessionAwareness: (sessionId: string, awareness: Awareness | null) => void;
};

export const disposeSessionTransport = (
  sessionId: string,
  transport: SessionTransport,
  deps: DisposeSessionTransportDeps
) => {
  // Avoid clobbering a newer provider during fast remounts (e.g. React StrictMode).
  try {
    const currentProvider = deps.getSessionProvider(sessionId);
    if (currentProvider === transport.provider) {
      // Note: setSessionProvider(..., null) disconnects/destroys the existing provider.
      deps.setSessionProvider(sessionId, null);
    } else {
      try {
        transport.provider.disconnect();
        transport.provider.destroy();
      } catch (_err) {}
    }
  } catch (_err) {}

  try {
    const currentAwareness = deps.getSessionAwareness(sessionId);
    if (currentAwareness === transport.awareness) {
      deps.setSessionAwareness(sessionId, null);
    }
  } catch (_err) {}
};

