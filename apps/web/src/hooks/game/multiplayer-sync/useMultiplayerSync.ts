/**
 * WebSocket-based Yjs sync via PartyKit.
 *
 * This keeps transport simple and reliable: one provider and room-backed storage.
 */
import { useEffect, useRef, useState } from "react";
import { useGameStore } from "@/store/gameStore";
import {
  clearRoomHostPending,
  isRoomHostPending,
  readRoomTokensFromStorage,
  resolveInviteTokenFromUrl,
  writeRoomTokensToStorage,
} from "@/lib/partyKitToken";
import { isApplyingRemoteUpdate } from "@/yjs/sync";
import { type LocalPlayerInitResult } from "./ensureLocalPlayerInitialized";
import { type PeerCounts } from "./peerCount";
import {
  cancelDebouncedTimeout,
  scheduleDebouncedTimeout,
} from "./debouncedTimeout";
import {
  setupSessionResources,
  teardownSessionResources,
  type SessionSetupResult,
} from "./sessionResources";
import { createAwarenessLifecycle } from "./awarenessLifecycle";
import { createAttemptJoin } from "./attemptJoin";
import {
  DEFAULT_BACKOFF_CONFIG,
  computeBackoffDelay,
  isRoomResetClose,
  type BackoffReason,
} from "./connectionBackoff";
import { useClientPrefsStore } from "@/store/clientPrefsStore";

export type SyncStatus = "connecting" | "connected";
type JoinBlockedReason =
  | NonNullable<LocalPlayerInitResult>["reason"]
  | "invite"
  | null;

export function useMultiplayerSync(sessionId: string) {
  const hasHydrated = useGameStore((state) => state.hasHydrated);
  const viewerRole = useGameStore((state) => state.viewerRole);
  const roomTokens = useGameStore((state) => state.roomTokens);
  const [status, setStatus] = useState<SyncStatus>("connecting");
  const [peerCounts, setPeerCounts] = useState<PeerCounts>(() => ({
    total: 1,
    players: viewerRole === "spectator" ? 0 : 1,
    spectators: viewerRole === "spectator" ? 1 : 0,
  }));
  const [joinBlocked, setJoinBlocked] = useState(false);
  const [joinBlockedReason, setJoinBlockedReason] =
    useState<JoinBlockedReason>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [connectEpoch, setConnectEpoch] = useState(0);
  const awarenessRef = useRef<SessionSetupResult["awareness"] | null>(null);
  const localPlayerIdRef = useRef<string | null>(null);
  const fullSyncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const postSyncFullSyncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const postSyncInitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stableResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttempt = useRef(0);
  const lastConnectEpoch = useRef(0);
  const pausedRef = useRef(false);
  const stoppedRef = useRef(false);
  const connectionGeneration = useRef(0);
  const attemptJoinRef = useRef<(() => void) | null>(null);
  const resourcesRef = useRef<SessionSetupResult | null>(null);
  const authFailureHandled = useRef(false);
  const setLastSessionId = useClientPrefsStore((state) => state.setLastSessionId);
  const clearLastSessionId = useClientPrefsStore((state) => state.clearLastSessionId);

  const clearReconnectTimer = () => {
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }
  };

  const clearStableResetTimer = () => {
    if (stableResetTimer.current) {
      clearTimeout(stableResetTimer.current);
      stableResetTimer.current = null;
    }
  };

  const markStableConnected = () => {
    clearStableResetTimer();
    stableResetTimer.current = setTimeout(() => {
      reconnectAttempt.current = 0;
      stableResetTimer.current = null;
    }, DEFAULT_BACKOFF_CONFIG.stableResetMs);
  };

  const scheduleReconnect = (reason: BackoffReason, resetAttempt = false) => {
    if (stoppedRef.current || pausedRef.current) return;
    if (reconnectTimer.current) return;
    if (resetAttempt) {
      reconnectAttempt.current = 0;
    }
    const delay = computeBackoffDelay(
      reconnectAttempt.current,
      reason,
      DEFAULT_BACKOFF_CONFIG
    );
    reconnectAttempt.current += 1;
    reconnectTimer.current = setTimeout(() => {
      reconnectTimer.current = null;
      setConnectEpoch((prev) => prev + 1);
    }, delay);
  };

  useEffect(() => {
    attemptJoinRef.current?.();
    const awareness = awarenessRef.current;
    const playerId = localPlayerIdRef.current;
    if (awareness && playerId) {
      awareness.setLocalStateField("client", { id: playerId, role: viewerRole });
    }
  }, [viewerRole]);

  useEffect(() => {
    pausedRef.current = isPaused;
  }, [isPaused]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const updatePauseState = () => {
      const hidden = typeof document !== "undefined" && document.visibilityState === "hidden";
      const offline = typeof navigator !== "undefined" && navigator.onLine === false;
      setIsPaused(hidden || offline);
    };
    updatePauseState();
    window.addEventListener("online", updatePauseState);
    window.addEventListener("offline", updatePauseState);
    document.addEventListener("visibilitychange", updatePauseState);
    return () => {
      window.removeEventListener("online", updatePauseState);
      window.removeEventListener("offline", updatePauseState);
      document.removeEventListener("visibilitychange", updatePauseState);
    };
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    if (typeof window === "undefined") return;
    if (!hasHydrated) return;

    if (isPaused) {
      clearReconnectTimer();
      clearStableResetTimer();
      const activeResources = resourcesRef.current;
      if (activeResources) {
        teardownSessionResources(sessionId, {
          awareness: activeResources.awareness,
          provider: activeResources.provider,
          intentTransport: activeResources.intentTransport,
        });
        resourcesRef.current = null;
        connectionGeneration.current += 1;
      }
      setStatus("connecting");
      return;
    }

    if (
      !resourcesRef.current &&
      !reconnectTimer.current &&
      connectEpoch === lastConnectEpoch.current
    ) {
      scheduleReconnect("resume", true);
    }
  }, [sessionId, hasHydrated, viewerRole, isPaused, connectEpoch]);

  useEffect(() => {
    return () => {
      stoppedRef.current = true;
      clearReconnectTimer();
      clearStableResetTimer();
    };
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    if (typeof window === "undefined") return;
    if (!hasHydrated) return;
    if (isPaused) return;
    if (connectEpoch === lastConnectEpoch.current) return;

    setJoinBlocked(false);
    setJoinBlockedReason(null);

    const inviteToken = resolveInviteTokenFromUrl(window.location.href);
    const storedTokens = readRoomTokensFromStorage(sessionId);
    const hasToken = Boolean(
      inviteToken.token ||
        storedTokens?.playerToken ||
        storedTokens?.spectatorToken ||
        roomTokens?.playerToken ||
        roomTokens?.spectatorToken
    );
    const canConnect = hasToken || isRoomHostPending(sessionId);
    if (!canConnect) {
      clearReconnectTimer();
      clearStableResetTimer();
      reconnectAttempt.current = 0;
      const activeResources = resourcesRef.current;
      if (activeResources) {
        teardownSessionResources(sessionId, {
          awareness: activeResources.awareness,
          provider: activeResources.provider,
          intentTransport: activeResources.intentTransport,
        });
        resourcesRef.current = null;
        connectionGeneration.current += 1;
      }
      setJoinBlocked(true);
      setJoinBlockedReason("invite");
      if (useClientPrefsStore.getState().lastSessionId === sessionId) {
        clearLastSessionId();
      }
      return;
    }

    lastConnectEpoch.current = connectEpoch;

    const nextGeneration = connectionGeneration.current + 1;
    const handleDisconnect = (event?: { code?: number; reason?: string } | null) => {
      if (stoppedRef.current || pausedRef.current) return;
      if (connectionGeneration.current !== nextGeneration) return;
      if (event?.code === 1008) return;
      clearStableResetTimer();
      setStatus("connecting");

      const activeResources = resourcesRef.current;
      if (activeResources) {
        teardownSessionResources(sessionId, {
          awareness: activeResources.awareness,
          provider: activeResources.provider,
          intentTransport: activeResources.intentTransport,
        });
        resourcesRef.current = null;
      }
      connectionGeneration.current += 1;
      scheduleReconnect(isRoomResetClose(event) ? "room-reset" : "close");
    };

    const resources = setupSessionResources({
      sessionId,
      statusSetter: setStatus,
      onIntentClose: handleDisconnect,
      onAuthFailure: () => {
        if (authFailureHandled.current) return;
        authFailureHandled.current = true;
        clearReconnectTimer();
        clearStableResetTimer();
        reconnectAttempt.current = 0;
        const store = useGameStore.getState();
        store.setRoomTokens(null);
        writeRoomTokensToStorage(sessionId, null);
        clearRoomHostPending(sessionId);
        if (useClientPrefsStore.getState().lastSessionId === sessionId) {
          clearLastSessionId();
        }
        setJoinBlocked(true);
        setJoinBlockedReason("invite");

        const activeResources = resourcesRef.current;
        if (activeResources) {
          teardownSessionResources(sessionId, {
            awareness: activeResources.awareness,
            provider: activeResources.provider,
            intentTransport: activeResources.intentTransport,
          });
          resourcesRef.current = null;
          connectionGeneration.current += 1;
        }
      },
    });

    if (!resources) return;
    connectionGeneration.current = nextGeneration;
    setLastSessionId(sessionId);

    const {
      awareness,
      provider,
      intentTransport,
      ensuredPlayerId,
      fullSyncToStore,
      doc,
    } = resources;
    awarenessRef.current = awareness;
    localPlayerIdRef.current = ensuredPlayerId;
    resourcesRef.current = resources;
    authFailureHandled.current = false;

    const attemptJoin = createAttemptJoin({
      playerId: ensuredPlayerId,
      setJoinState: (blocked, reason) => {
        setJoinBlocked(blocked);
        setJoinBlockedReason(reason);
      },
      getRole: () => useGameStore.getState().viewerRole,
    });
    attemptJoinRef.current = attemptJoin;

    const SYNC_DEBOUNCE_MS = 50;
    const scheduleFullSync = () => {
      scheduleDebouncedTimeout(fullSyncTimer, SYNC_DEBOUNCE_MS, fullSyncToStore);
    };

    const handleDocUpdate = () => {
      if (isApplyingRemoteUpdate()) return;
      scheduleFullSync();
    };
    doc.on("update", handleDocUpdate);

    const { pushLocalAwareness, handleAwarenessChange, disposeAwareness } =
      createAwarenessLifecycle({
        awareness,
        playerId: ensuredPlayerId,
        getViewerRole: () => useGameStore.getState().viewerRole,
        onPeerCounts: setPeerCounts,
      });
    pushLocalAwareness();
    awareness.on("change", handleAwarenessChange);
    handleAwarenessChange();

    provider.on("status", ({ status: s }: any) => {
      if (connectionGeneration.current !== nextGeneration) return;
      if (s === "connected") {
        pushLocalAwareness();
        markStableConnected();
      }
      if (s === "disconnected") {
        clearStableResetTimer();
      }
    });

    if ("on" in provider && typeof provider.on === "function") {
      provider.on("connection-close", handleDisconnect as any);
      provider.on("connection-error", handleDisconnect as any);
    }

    provider.on("sync", (isSynced: boolean) => {
      if (!isSynced) return;
      scheduleDebouncedTimeout(postSyncFullSyncTimer, 50, fullSyncToStore);
      scheduleDebouncedTimeout(postSyncInitTimer, 60, attemptJoin);
    });

    return () => {
      disposeAwareness();
      awarenessRef.current = null;
      localPlayerIdRef.current = null;

      awareness.off("change", handleAwarenessChange);
      doc.off("update", handleDocUpdate);
      cancelDebouncedTimeout(fullSyncTimer);
      cancelDebouncedTimeout(postSyncFullSyncTimer);
      cancelDebouncedTimeout(postSyncInitTimer);
      clearStableResetTimer();

      teardownSessionResources(sessionId, { awareness, provider, intentTransport });
      resourcesRef.current = null;
      connectionGeneration.current += 1;

      attemptJoinRef.current = null;
    };
  }, [
    sessionId,
    hasHydrated,
    viewerRole,
    connectEpoch,
    isPaused,
    setLastSessionId,
    clearLastSessionId,
  ]);

  return { status, peerCounts, joinBlocked, joinBlockedReason };
}
