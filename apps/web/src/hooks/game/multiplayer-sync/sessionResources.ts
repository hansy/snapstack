import type * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";
import { WebsocketProvider } from "y-websocket";
import { bindSharedLogStore } from "@/logging/logStore";
import { getOrCreateClientKey } from "@/lib/clientKey";
import { useCommandLog } from "@/lib/featureFlags";
import {
  getSessionKeyForRole,
  syncSessionAccessKeysFromLocation,
} from "@/lib/sessionKeys";
import { buildSignalingUrlFromEnv } from "@/lib/wsSignaling";
import { useGameStore } from "@/store/gameStore";
import type { CommandEnvelope } from "@/commandLog/types";
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
  commands: Y.Array<CommandEnvelope>;
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
    commands,
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
    store.resetSession(sessionId);
  } else {
    useGameStore.setState((state) => ({ ...state, sessionId }));
  }

  const { keys, fromHash } = syncSessionAccessKeysFromLocation(sessionId);
  if (fromHash.spectatorKey && !fromHash.playerKey) {
    store.setViewerRole("spectator");
  } else if (fromHash.playerKey) {
    store.setViewerRole("player");
  } else if (keys.spectatorKey && !keys.playerKey) {
    store.setViewerRole("spectator");
  }
  const viewerRole = useGameStore.getState().viewerRole;
  const accessKey = getSessionKeyForRole(keys, viewerRole);
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

  const params: Record<string, string> = {
    userId: ensuredPlayerId,
    clientKey,
    sessionVersion: String(sessionVersion),
    clientVersion: CLIENT_VERSION,
    role: viewerRole,
  };
  if (accessKey) {
    params.accessKey = accessKey;
  }

  const provider = new WebsocketProvider(signalingUrl, sessionId, doc, {
    awareness,
    connect: true,
    params,
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

  const legacyFullSyncToStore = createFullSyncToStore(sharedMaps, (next) => {
    useGameStore.setState(next);
  });
  let warned = false;
  const fullSyncToStore = useCommandLog
    ? () => {
        if (!warned) {
          console.warn(
            "[command-log] useCommandLog is enabled; falling back to legacy Yjs snapshot sync until command log replay is wired.",
          );
          warned = true;
        }
        legacyFullSyncToStore();
      }
    : legacyFullSyncToStore;

  flushPendingMutations();

  return {
    awareness,
    provider,
    doc,
    sharedMaps,
    ensuredPlayerId,
    fullSyncToStore,
    commands,
  };
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
