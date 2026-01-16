import type { Awareness } from "y-protocols/awareness";
import type { YSyncProvider } from "@/yjs/provider";

export type SessionTransport = {
  provider: YSyncProvider;
  awareness: Awareness;
};

export type DisposeSessionTransportDeps = {
  getSessionProvider: (sessionId: string) => YSyncProvider | null;
  setSessionProvider: (sessionId: string, provider: YSyncProvider | null) => void;
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
