import type * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";
import YPartyServerProvider from "y-partyserver/provider";
import { toast } from "sonner";
import { clearLogs, emitLog } from "@/logging/logStore";
import { resolvePartyKitHost } from "@/lib/partyKitHost";
import {
  clearInviteTokenFromUrl,
  clearRoomHostPending,
  mergeRoomTokens,
  readRoomTokensFromStorage,
  resolveInviteTokenFromUrl,
  writeRoomTokensToStorage,
} from "@/lib/partyKitToken";
import {
  clearIntentTransport,
  createIntentTransport,
  setIntentTransport,
  type IntentTransport,
} from "@/partykit/intentTransport";
import { PARTY_NAME } from "@/partykit/config";
import type { PrivateOverlayPayload, RoomTokensPayload } from "@/partykit/messages";
import { useGameStore } from "@/store/gameStore";
import { handleIntentAck } from "@/store/gameStore/dispatchIntent";
import {
  acquireSession,
  cleanupStaleSessions,
  getSessionAwareness,
  getSessionProvider,
  releaseSession,
  setActiveSession,
  setSessionAwareness,
  setSessionProvider,
} from "@/yjs/docManager";
import { type SharedMaps } from "@/yjs/yMutations";
import { createFullSyncToStore } from "./fullSyncToStore";
import { disposeSessionTransport } from "./disposeSessionTransport";
import type { SyncStatus } from "./useMultiplayerSync";
import type { YSyncProvider } from "@/yjs/provider";

export type SessionSetupResult = {
  awareness: Awareness;
  provider: YSyncProvider;
  intentTransport: IntentTransport;
  doc: Y.Doc;
  sharedMaps: SharedMaps;
  ensuredPlayerId: string;
  fullSyncToStore: () => void;
};

export type SessionSetupDeps = {
  sessionId: string;
  statusSetter: (next: SyncStatus) => void;
  onAuthFailure?: (reason: string) => void;
};

export function setupSessionResources({
  sessionId,
  statusSetter,
  onAuthFailure,
}: SessionSetupDeps): SessionSetupResult | null {
  const envHost = resolvePartyKitHost(import.meta.env.VITE_WEBSOCKET_SERVER);
  const defaultHost =
    import.meta.env.DEV && typeof window !== "undefined"
      ? "localhost:8787"
      : typeof window !== "undefined"
        ? window.location.host
        : null;
  const partyHost = envHost ?? defaultHost;
  if (!partyHost) {
    console.error("[party] VITE_WEBSOCKET_SERVER is required");
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
    meta,
    handRevealsToAll,
    libraryRevealsToAll,
    faceDownRevealsToAll,
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
    handRevealsToAll,
    libraryRevealsToAll,
    faceDownRevealsToAll,
  };

  // Setup store
  const store = useGameStore.getState();
  const ensuredPlayerId = store.ensurePlayerIdForSession(sessionId);
  const needsReset =
    store.sessionId !== sessionId || store.myPlayerId !== ensuredPlayerId;
  if (needsReset) {
    store.resetSession(sessionId, ensuredPlayerId);
  } else {
    useGameStore.setState((state) => ({ ...state, sessionId }));
  }

  const storedTokens = readRoomTokensFromStorage(sessionId);
  if (storedTokens) {
    useGameStore.getState().setRoomTokens(storedTokens);
    clearRoomHostPending(sessionId);
  }
  const inviteToken =
    typeof window !== "undefined"
      ? resolveInviteTokenFromUrl(window.location.href)
      : {};
  if (inviteToken.token) {
    const currentTokens = useGameStore.getState().roomTokens;
    const nextTokens = mergeRoomTokens(storedTokens ?? currentTokens, {
      ...(inviteToken.role === "spectator"
        ? { spectatorToken: inviteToken.token }
        : { playerToken: inviteToken.token }),
    });
    if (nextTokens) {
      useGameStore.getState().setRoomTokens(nextTokens);
      writeRoomTokensToStorage(sessionId, nextTokens);
    }
  }
  if (inviteToken.role) {
    const currentRole = useGameStore.getState().viewerRole;
    if (inviteToken.role !== currentRole) {
      useGameStore.getState().setViewerRole(inviteToken.role);
    }
  }
  if (inviteToken.token || inviteToken.role) {
    clearInviteTokenFromUrl();
  }

  const intentViewerRole =
    inviteToken.role ?? useGameStore.getState().viewerRole;
  const fallbackToken =
    intentViewerRole === "spectator"
      ? useGameStore.getState().roomTokens?.spectatorToken
      : useGameStore.getState().roomTokens?.playerToken;
  const token = inviteToken.token ?? fallbackToken;

  const awareness = new Awareness(doc);
  const provider: YSyncProvider = new YPartyServerProvider(
    partyHost,
    sessionId,
    doc,
    {
      party: PARTY_NAME,
      awareness,
      connect: true,
      params: async () => {
        const state = useGameStore.getState();
        const role = state.viewerRole;
        const syncToken =
          role === "spectator"
            ? state.roomTokens?.spectatorToken
            : state.roomTokens?.playerToken;
        const tokenParam =
          syncToken && role === "spectator"
            ? { st: syncToken }
            : syncToken
              ? { gt: syncToken }
              : {};
        return {
          role: "sync",
          ...tokenParam,
          ...(ensuredPlayerId ? { playerId: ensuredPlayerId } : {}),
          ...(role ? { viewerRole: role } : {}),
        };
      },
    }
  );

  if ("on" in provider && typeof provider.on === "function") {
    const handleConnectionClose = (event: CloseEvent) => {
      if (event?.code === 1008) {
        try {
          provider.disconnect();
        } catch (_err) {}
        onAuthFailure?.(event.reason || "policy");
      }
    };
    provider.on("connection-close", handleConnectionClose);
    provider.on("connection-error", handleConnectionClose as any);
  }

  let pendingOverlay: PrivateOverlayPayload | null = null;
  let overlayFlushTimer: number | null = null;

  const scheduleOverlayFlush = () => {
    if (overlayFlushTimer !== null) return;
    overlayFlushTimer = window.setTimeout(() => {
      overlayFlushTimer = null;
      if (!pendingOverlay) return;
      if (useGameStore.getState().sessionId !== sessionId) {
        pendingOverlay = null;
        return;
      }
      const nextOverlay = pendingOverlay;
      pendingOverlay = null;
      useGameStore.getState().applyPrivateOverlay(nextOverlay);
    }, 0);
  };

  const intentTransport = createIntentTransport({
    host: partyHost,
    room: sessionId,
    token,
    playerId: ensuredPlayerId,
    viewerRole: intentViewerRole,
    onMessage: (message) => {
      if (message.type === "ack") {
        const error = handleIntentAck(message, useGameStore.setState);
        if (error) {
          toast.error(error);
        }
        return;
      }
      if (message.type === "roomTokens") {
        const payload = message.payload as RoomTokensPayload;
        useGameStore.getState().setRoomTokens(payload);
        writeRoomTokensToStorage(
          sessionId,
          mergeRoomTokens(useGameStore.getState().roomTokens, payload)
        );
        clearRoomHostPending(sessionId);
        return;
      }
      if (message.type === "privateOverlay") {
        pendingOverlay = message.payload as PrivateOverlayPayload;
        scheduleOverlayFlush();
        return;
      }
      if (message.type === "logEvent") {
        const { players, cards, zones } = useGameStore.getState();
        emitLog(message.eventId as any, message.payload as any, {
          players,
          cards,
          zones,
        });
      }
    },
    onClose: (event) => {
      if (event.code === 1008) {
        onAuthFailure?.(event.reason || "policy");
      }
    },
  });
  setIntentTransport(intentTransport);

  provider.on("status", ({ status: s }: any) => {
    if (s === "connected") {
      clearLogs();
      statusSetter("connected");
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

  return {
    awareness,
    provider,
    intentTransport,
    doc,
    sharedMaps,
    ensuredPlayerId,
    fullSyncToStore,
  };
}

export function teardownSessionResources(
  sessionId: string,
  resources: Pick<SessionSetupResult, "awareness" | "provider" | "intentTransport">
) {
  setActiveSession(null);
  disposeSessionTransport(
    sessionId,
    { provider: resources.provider, awareness: resources.awareness },
    {
      getSessionProvider,
      setSessionProvider,
      getSessionAwareness,
      setSessionAwareness,
    }
  );
  releaseSession(sessionId);
  cleanupStaleSessions();
  clearIntentTransport();
}
