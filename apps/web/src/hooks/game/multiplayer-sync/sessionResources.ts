import type * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";
import YPartyServerProvider from "y-partyserver/provider";
import { toast } from "sonner";
import { clearLogs, emitLog } from "@/logging/logStore";
import {
  clearInviteTokenFromUrl,
  clearRoomHostPending,
  mergeRoomTokens,
  readRoomTokensFromStorage,
  resolveInviteTokenFromUrl,
  writeRoomTokensToStorage,
} from "@/lib/partyKitToken";
import { resolveJoinToken } from "@/lib/joinToken";
import {
  clearIntentTransport,
  createIntentTransport,
  sendPartyMessage,
  setIntentTransport,
  type IntentTransport,
} from "@/partykit/intentTransport";
import { PARTY_NAME } from "@/partykit/config";
import type {
  PrivateOverlayDiffPayload,
  PrivateOverlayPayload,
  RoomTokensPayload,
} from "@/partykit/messages";
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
import type { ViewerRole } from "@/types";

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
  onIntentOpen?: () => void;
  onIntentClose?: (event: CloseEvent) => void;
  joinToken?: string;
};

export function setupSessionResources({
  sessionId,
  statusSetter,
  onAuthFailure,
  onIntentOpen,
  onIntentClose,
  joinToken,
}: SessionSetupDeps): SessionSetupResult | null {
  const partyHost =
    (import.meta.env.VITE_SERVER_HOST as string) || "localhost:8787";

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

  const resolveTokenForRole = (
    role: ViewerRole | undefined,
    tokens: RoomTokensPayload | null,
  ): { token?: string; tokenRole?: ViewerRole } => {
    if (!role || !tokens) return {};
    if (role === "spectator") {
      if (tokens.spectatorToken) {
        return { token: tokens.spectatorToken, tokenRole: "spectator" };
      }
      if (tokens.playerToken) {
        return { token: tokens.playerToken, tokenRole: "player" };
      }
      return {};
    }
    if (tokens.playerToken) {
      return { token: tokens.playerToken, tokenRole: "player" };
    }
    return {};
  };

  const intentViewerRole = useGameStore.getState().viewerRole;
  const intentCapabilities = ["overlay-diff-v1"];
  const resolvedIntentToken =
    inviteToken.token && inviteToken.role
      ? { token: inviteToken.token, tokenRole: inviteToken.role }
      : resolveTokenForRole(
          intentViewerRole,
          useGameStore.getState().roomTokens,
        );
  const token = resolvedIntentToken.token;
  const tokenRole = resolvedIntentToken.tokenRole;

  const awareness = new Awareness(doc);
  const provider: YSyncProvider = new YPartyServerProvider(
    partyHost,
    sessionId,
    doc,
    {
      party: PARTY_NAME,
      awareness,
      connect: false,
      params: async () => {
        const state = useGameStore.getState();
        const role = state.viewerRole;
        const resolvedSyncToken = resolveTokenForRole(role, state.roomTokens);
        const syncToken = resolvedSyncToken.token;
        const syncTokenRole = resolvedSyncToken.tokenRole;
        const resolvedJoinToken = joinToken ?? (await resolveJoinToken(sessionId));
        const tokenParam =
          syncToken && syncTokenRole === "spectator"
            ? { st: syncToken }
            : syncToken && syncTokenRole === "player"
              ? { gt: syncToken }
              : {};
        return {
          role: "sync",
          ...tokenParam,
          ...(resolvedJoinToken ? { jt: resolvedJoinToken } : {}),
          ...(ensuredPlayerId ? { playerId: ensuredPlayerId } : {}),
          ...(role ? { viewerRole: role } : {}),
        };
      },
    },
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

  const flushPendingOverlay = () => {
    if (!pendingOverlay) return;
    if (overlayFlushTimer !== null) {
      window.clearTimeout(overlayFlushTimer);
      overlayFlushTimer = null;
    }
    if (useGameStore.getState().sessionId !== sessionId) {
      pendingOverlay = null;
      return;
    }
    const nextOverlay = pendingOverlay;
    pendingOverlay = null;
    useGameStore.getState().applyPrivateOverlay(nextOverlay);
  };

  const scheduleOverlayFlush = () => {
    if (overlayFlushTimer !== null) return;
    overlayFlushTimer = window.setTimeout(() => {
      overlayFlushTimer = null;
      flushPendingOverlay();
    }, 0);
  };

  const intentTransport = createIntentTransport({
    host: partyHost,
    room: sessionId,
    token,
    tokenRole,
    playerId: ensuredPlayerId,
    viewerRole: intentViewerRole,
    ...(joinToken
      ? { joinToken }
      : { getJoinToken: () => resolveJoinToken(sessionId) }),
    socketOptions: {
      maxEnqueuedMessages: 0,
      connectionTimeout: 10_000,
      minReconnectionDelay: 1_000,
      maxReconnectionDelay: 10_000,
      maxRetries: 0,
      startClosed: true,
    },
    onOpen: () => {
      onIntentOpen?.();
      sendPartyMessage({
        type: "hello",
        payload: { capabilities: intentCapabilities },
      });
    },
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
          mergeRoomTokens(useGameStore.getState().roomTokens, payload),
        );
        clearRoomHostPending(sessionId);
        return;
      }
      if (message.type === "helloAck") {
        const payload = message.payload as { acceptedCapabilities?: string[] };
        if (Array.isArray(payload?.acceptedCapabilities)) {
          useGameStore
            .getState()
            .setOverlayCapabilities(payload.acceptedCapabilities);
        }
        return;
      }
      if (message.type === "privateOverlay") {
        pendingOverlay = message.payload as PrivateOverlayPayload;
        scheduleOverlayFlush();
        return;
      }
      if (message.type === "privateOverlayDiff") {
        if (pendingOverlay) {
          flushPendingOverlay();
        }
        const diff = message.payload as PrivateOverlayDiffPayload;
        const applied = useGameStore.getState().applyPrivateOverlayDiff(diff);
        if (!applied) {
          const lastVersion =
            useGameStore.getState().privateOverlay?.overlayVersion;
          sendPartyMessage({
            type: "overlayResync",
            payload: {
              reason: "version-mismatch",
              lastOverlayVersion:
                typeof lastVersion === "number" ? lastVersion : undefined,
            },
          });
        }
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
        return;
      }
      onIntentClose?.(event);
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
  resources: Pick<
    SessionSetupResult,
    "awareness" | "provider" | "intentTransport"
  >,
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
    },
  );
  releaseSession(sessionId);
  cleanupStaleSessions();
  clearIntentTransport();
}
