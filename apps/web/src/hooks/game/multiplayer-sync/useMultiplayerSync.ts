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
import { emitLog } from "@/logging/logStore";
import { isRoomResetClose } from "./connectionBackoff";
import {
  createConnectionMachineState,
  transitionConnectionMachine,
  type ConnectionMachineEffect,
  type ConnectionMachineEvent,
} from "./connectionMachine";
import { useClientPrefsStore } from "@/store/clientPrefsStore";

export type SyncStatus = "connecting" | "connected";
type JoinBlockedReason =
  | NonNullable<LocalPlayerInitResult>["reason"]
  | "invite"
  | null;

const CONNECTION_LOGS_ENABLED = false;

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
  const connectionMachineRef = useRef(createConnectionMachineState());
  const dispatchConnectionEventRef = useRef<(event: ConnectionMachineEvent) => void>(() => {});
  const lastConnectEpoch = useRef(-1);
  const pausedRef = useRef(false);
  const stoppedRef = useRef(false);
  const connectionGeneration = useRef(0);
  const attemptJoinRef = useRef<(() => void) | null>(null);
  const resourcesRef = useRef<SessionSetupResult | null>(null);
  const authFailureHandled = useRef(false);
  const setLastSessionId = useClientPrefsStore((state) => state.setLastSessionId);
  const clearLastSessionId = useClientPrefsStore((state) => state.clearLastSessionId);

  const emitConnectionLog = (eventId: "connection.reconnect" | "connection.reconnectAbandoned" | "connection.authFailure", payload: any) => {
    if (!CONNECTION_LOGS_ENABLED) return;
    const { players, cards, zones } = useGameStore.getState();
    emitLog(eventId, payload, { players, cards, zones });
  };

  const applyConnectionEffects = (effects: ConnectionMachineEffect[]) => {
    effects.forEach((effect) => {
      switch (effect.type) {
        case "cancelReconnect": {
          if (reconnectTimer.current) {
            clearTimeout(reconnectTimer.current);
            reconnectTimer.current = null;
          }
          break;
        }
        case "scheduleReconnect": {
          if (reconnectTimer.current) {
            clearTimeout(reconnectTimer.current);
          }
          reconnectTimer.current = setTimeout(() => {
            reconnectTimer.current = null;
            dispatchConnectionEventRef.current({ type: "reconnect-timer-fired" });
            setConnectEpoch((prev) => prev + 1);
          }, effect.delayMs);
          emitConnectionLog("connection.reconnect", {
            reason: effect.reason,
            attempt: effect.attempt + 1,
            delayMs: effect.delayMs,
          });
          break;
        }
        case "abandonReconnect": {
          console.warn("[multiplayer] Abandoning reconnection after too many attempts");
          emitConnectionLog("connection.reconnectAbandoned", { attempt: effect.attempt });
          break;
        }
        case "cancelStableReset": {
          if (stableResetTimer.current) {
            clearTimeout(stableResetTimer.current);
            stableResetTimer.current = null;
          }
          break;
        }
        case "scheduleStableReset": {
          if (stableResetTimer.current) {
            clearTimeout(stableResetTimer.current);
          }
          stableResetTimer.current = setTimeout(() => {
            stableResetTimer.current = null;
            dispatchConnectionEventRef.current({ type: "stable-reset-timer-fired" });
          }, effect.delayMs);
          break;
        }
        default:
          break;
      }
    });
  };

  const dispatchConnectionEvent = (event: ConnectionMachineEvent) => {
    const { state, effects } = transitionConnectionMachine(
      connectionMachineRef.current,
      event
    );
    connectionMachineRef.current = state;
    applyConnectionEffects(effects);
  };

  dispatchConnectionEventRef.current = dispatchConnectionEvent;

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
      dispatchConnectionEvent({ type: "pause" });
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
      connectEpoch === lastConnectEpoch.current
    ) {
      dispatchConnectionEvent({ type: "resume" });
    }
  }, [sessionId, hasHydrated, viewerRole, isPaused, connectEpoch]);

  useEffect(() => {
    return () => {
      stoppedRef.current = true;
      dispatchConnectionEvent({ type: "pause" });
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
      if (stableResetTimer.current) {
        clearTimeout(stableResetTimer.current);
        stableResetTimer.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    if (typeof window === "undefined") return;
    if (!hasHydrated) return;
    if (isPaused) return;
    // Skip if we've already processed this epoch AND we have active resources.
    // If resources were torn down (e.g. by StrictMode cleanup), we need to reconnect.
    if (connectEpoch === lastConnectEpoch.current && resourcesRef.current) return;

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
      dispatchConnectionEvent({ type: "reset" });
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
      setStatus("connecting");
      dispatchConnectionEvent({
        type: "disconnected",
        reason: isRoomResetClose(event) ? "room-reset" : "close",
      });

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
    };

    const resources = setupSessionResources({
      sessionId,
      statusSetter: setStatus,
      onIntentClose: handleDisconnect,
      onAuthFailure: (reason) => {
        if (authFailureHandled.current) return;
        authFailureHandled.current = true;
        dispatchConnectionEvent({ type: "reset" });
        const store = useGameStore.getState();
        store.setRoomTokens(null);
        writeRoomTokensToStorage(sessionId, null);
        clearRoomHostPending(sessionId);
        if (useClientPrefsStore.getState().lastSessionId === sessionId) {
          clearLastSessionId();
        }
        setJoinBlocked(true);
        setJoinBlockedReason("invite");
        emitConnectionLog("connection.authFailure", { reason });

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
        dispatchConnectionEvent({ type: "connected" });
      }
      if (s === "disconnected") {
        dispatchConnectionEvent({ type: "status-disconnected" });
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
      dispatchConnectionEvent({ type: "reset" });

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
