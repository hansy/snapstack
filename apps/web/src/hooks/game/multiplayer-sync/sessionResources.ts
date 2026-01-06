import type * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";
import { WebsocketProvider } from "y-websocket";
import { bindSharedLogStore } from "@/logging/logStore";
import { getOrCreateClientKey } from "@/lib/clientKey";
import { buildSignalingUrlFromEnv } from "@/lib/wsSignaling";
import { useGameStore } from "@/store/gameStore";
import {
  acquireSession,
  cleanupStaleSessions,
  getSessionAwareness,
  getSessionProvider,
  releaseSession,
  setActiveSession,
  setSessionAwareness,
  setSessionProvider,
  flushPendingMutations,
} from "@/yjs/docManager";
import { type SharedMaps } from "@/yjs/yMutations";
import { createFullSyncToStore } from "./fullSyncToStore";
import { disposeSessionTransport } from "./disposeSessionTransport";
import type { SyncStatus } from "./useMultiplayerSync";

export type SessionSetupResult = {
  awareness: Awareness;
  provider: WebsocketProvider;
  doc: Y.Doc;
  sharedMaps: SharedMaps;
  ensuredPlayerId: string;
  fullSyncToStore: () => void;
};

export type SessionSetupDeps = {
  sessionId: string;
  statusSetter: (next: SyncStatus) => void;
};

const CLIENT_VERSION = "web-3-ws";

export function setupSessionResources({
  sessionId,
  statusSetter,
}: SessionSetupDeps): SessionSetupResult | null {
  const envUrl = import.meta.env.VITE_WEBSOCKET_SERVER;
  const signalingUrl = buildSignalingUrlFromEnv(envUrl);
  if (!signalingUrl) {
    console.error("[signal] VITE_WEBSOCKET_SERVER is required");
    return null;
  }

  cleanupStaleSessions();
  const handles = acquireSession(sessionId);
  setActiveSession(sessionId);

  const {
    doc,
    players,
    playerOrder,
    zones,
    cards,
    zoneCardOrders,
    globalCounters,
    battlefieldViewScale,
    logs,
    meta,
  } = handles;

  const sharedMaps: SharedMaps = {
    players,
    playerOrder,
    zones,
    cards,
    zoneCardOrders,
    globalCounters,
    battlefieldViewScale,
    meta,
  };

  // Setup store
  const store = useGameStore.getState();
  const ensuredPlayerId = store.ensurePlayerIdForSession(sessionId);
  const needsReset = store.sessionId !== sessionId || store.myPlayerId !== ensuredPlayerId;
  if (needsReset) {
    store.resetSession(sessionId, ensuredPlayerId);
  } else {
    useGameStore.setState((state) => ({ ...state, sessionId }));
  }
  const sessionVersion = useGameStore.getState().ensureSessionVersion(sessionId);

  bindSharedLogStore(logs);

  const awareness = new Awareness(doc);
  const clientKey = getOrCreateClientKey({
    storage: typeof window !== "undefined" ? window.sessionStorage : undefined,
    randomUUID:
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID.bind(crypto)
        : undefined,
  });

  const provider = new WebsocketProvider(signalingUrl, sessionId, doc, {
    awareness,
    connect: true,
    params: {
      userId: ensuredPlayerId,
      clientKey,
      sessionVersion: String(sessionVersion),
      clientVersion: CLIENT_VERSION,
    },
  });

  provider.on("status", ({ status: s }: any) => {
    if (s === "connected") {
      statusSetter("connected");
      flushPendingMutations();
    }
    if (s === "disconnected") {
      statusSetter("connecting");
    }
  });

  setSessionProvider(sessionId, provider);
  setSessionAwareness(sessionId, awareness);

  const fullSyncToStore = createFullSyncToStore(sharedMaps, (next) => {
    useGameStore.setState(next);
  });

  flushPendingMutations();

  return { awareness, provider, doc, sharedMaps, ensuredPlayerId, fullSyncToStore };
}

export function teardownSessionResources(
  sessionId: string,
  resources: Pick<SessionSetupResult, "awareness" | "provider">,
) {
  bindSharedLogStore(null);
  setActiveSession(null);
  disposeSessionTransport(
    sessionId,
    { provider: resources.provider, awareness: resources.awareness },
    {
      getSessionProvider,
      setSessionProvider,
      getSessionAwareness,
      setSessionAwareness,
    },
  );
  releaseSession(sessionId);
  cleanupStaleSessions();
}
