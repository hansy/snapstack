/**
 * WebSocket-based Yjs sync via PartyKit.
 *
 * This keeps transport simple and reliable: one provider and room-backed storage.
 */
import { useEffect, useRef, useState } from "react";
import { useGameStore } from "@/store/gameStore";
import {
  clearRoomUnavailable,
  clearRoomHostPending,
  isRoomHostPending,
  isRoomUnavailable,
  markRoomUnavailable,
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
import { resolveJoinToken } from "@/lib/joinToken";
import { isRateLimitedClose, isRoomResetClose } from "./connectionBackoff";
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
  | "room-unavailable"
  | null;

const CONNECTION_LOGS_ENABLED = false;
const INTENT_DISCONNECT_GRACE_MS = 15_000;

export function useMultiplayerSync(sessionId: string, locationKey?: string) {
  const hasHydrated = useGameStore((state) => state.hasHydrated);
  const viewerRole = useGameStore((state) => state.viewerRole);
  const roomTokens = useGameStore((state) => state.roomTokens);
  const [roomUnavailable, setRoomUnavailable] = useState(() =>
    sessionId ? isRoomUnavailable(sessionId) : false
  );
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
  const intentCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectAttemptTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectionMachineRef = useRef(createConnectionMachineState());
  const dispatchConnectionEventRef = useRef<(event: ConnectionMachineEvent) => void>(() => {});
  const lastConnectEpoch = useRef(-1);
  const pausedRef = useRef(false);
  const connectionGeneration = useRef(0);
  const roomUnavailableRef = useRef(roomUnavailable);
  const intentClosedAtRef = useRef<number | null>(null);
  const attemptJoinRef = useRef<(() => void) | null>(null);
  const resourcesRef = useRef<SessionSetupResult | null>(null);
  const pendingIntentJoinRef = useRef(false);
  const authFailureHandled = useRef(false);
  const initialSessionEvidenceRef = useRef({
    sessionId: "",
    hadLastSession: false,
  });
  const priorSessionEvidenceRef = useRef({
    sessionId: "",
    hasTokens: false,
    hadLastSession: false,
  });
  const setLastSessionId = useClientPrefsStore((state) => state.setLastSessionId);
  const clearLastSessionId = useClientPrefsStore((state) => state.clearLastSessionId);

  const emitConnectionLog = (eventId: "connection.reconnect" | "connection.reconnectAbandoned" | "connection.authFailure", payload: any) => {
    if (!CONNECTION_LOGS_ENABLED) return;
    const { players, cards, zones } = useGameStore.getState();
    emitLog(eventId, payload, { players, cards, zones });
  };

  const applyRoomUnavailable = () => {
    if (!sessionId) return;
    if (!roomUnavailableRef.current) {
      markRoomUnavailable(sessionId);
      roomUnavailableRef.current = true;
    }
    setRoomUnavailable(true);
    setJoinBlocked(true);
    setJoinBlockedReason("room-unavailable");
    setStatus("connecting");
    dispatchConnectionEventRef.current({ type: "reset" });

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

    resetIntentCloseTracking();

    const store = useGameStore.getState();
    store.setRoomTokens(null);
    writeRoomTokensToStorage(sessionId, null);
    clearRoomHostPending(sessionId);
    if (useClientPrefsStore.getState().lastSessionId === sessionId) {
      clearLastSessionId();
    }
  };

  const resetIntentCloseTracking = () => {
    intentClosedAtRef.current = null;
    if (intentCloseTimer.current) {
      clearTimeout(intentCloseTimer.current);
      intentCloseTimer.current = null;
    }
  };

  const clearConnectAttemptTimer = () => {
    if (connectAttemptTimer.current) {
      clearTimeout(connectAttemptTimer.current);
      connectAttemptTimer.current = null;
    }
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

  const disableProviderAutoReconnect = (provider: any) => {
    if (provider && "shouldConnect" in provider) {
      provider.shouldConnect = false;
    }
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
    roomUnavailableRef.current = roomUnavailable;
  }, [roomUnavailable]);

  useEffect(() => {
    dispatchConnectionEvent({ type: "reset" });
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    const unavailable = isRoomUnavailable(sessionId);
    roomUnavailableRef.current = unavailable;
    setRoomUnavailable(unavailable);
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) {
      initialSessionEvidenceRef.current = {
        sessionId: "",
        hadLastSession: false,
      };
      priorSessionEvidenceRef.current = {
        sessionId: "",
        hasTokens: false,
        hadLastSession: false,
      };
      return;
    }
    const lastSessionId = useClientPrefsStore.getState().lastSessionId;
    initialSessionEvidenceRef.current = {
      sessionId,
      hadLastSession: lastSessionId === sessionId,
    };
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) {
      priorSessionEvidenceRef.current = {
        sessionId: "",
        hasTokens: false,
        hadLastSession: false,
      };
      return;
    }
    const storedTokens = readRoomTokensFromStorage(sessionId);
    const storeTokens = useGameStore.getState().roomTokens;
    const hasTokens = Boolean(
      storedTokens?.playerToken ||
        storedTokens?.spectatorToken ||
        storeTokens?.playerToken ||
        storeTokens?.spectatorToken
    );
    const hadLastSession =
      initialSessionEvidenceRef.current.sessionId === sessionId &&
      initialSessionEvidenceRef.current.hadLastSession;
    priorSessionEvidenceRef.current = {
      sessionId,
      hasTokens,
      hadLastSession,
    };
  }, [sessionId, roomTokens?.playerToken, roomTokens?.spectatorToken]);

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
      const offline = typeof navigator !== "undefined" && navigator.onLine === false;
      setIsPaused(offline);
    };
    updatePauseState();
    window.addEventListener("online", updatePauseState);
    window.addEventListener("offline", updatePauseState);
    return () => {
      window.removeEventListener("online", updatePauseState);
      window.removeEventListener("offline", updatePauseState);
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
      resetIntentCloseTracking();
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
    let cancelled = false;
    let cleanup: (() => void) | undefined;
    let cleanedUp = false;

    const run = async () => {
      if (!sessionId) {
        return;
      }
      if (typeof window === "undefined") {
        return;
      }
      if (!hasHydrated) {
        return;
      }
      if (isPaused) {
        return;
      }
      const inviteToken = resolveInviteTokenFromUrl(window.location.href);
      const hostPending = isRoomHostPending(sessionId);
      if (roomUnavailableRef.current || isRoomUnavailable(sessionId)) {
        if (inviteToken.token || hostPending) {
          clearRoomUnavailable(sessionId);
          roomUnavailableRef.current = false;
          setRoomUnavailable(false);
        } else {
          applyRoomUnavailable();
          return;
        }
      }
      // Skip if we've already processed this epoch AND we have active resources.
      // If resources were torn down (e.g. by StrictMode cleanup), we need to reconnect.
      if (connectEpoch === lastConnectEpoch.current && resourcesRef.current) {
        return;
      }

      setJoinBlocked(false);
      setJoinBlockedReason(null);

      const storedTokens = readRoomTokensFromStorage(sessionId);
      const hasToken = Boolean(
        inviteToken.token ||
          storedTokens?.playerToken ||
          storedTokens?.spectatorToken ||
          roomTokens?.playerToken ||
          roomTokens?.spectatorToken
      );
      const canConnect = hasToken || hostPending;
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
        resetIntentCloseTracking();
        setJoinBlocked(true);
        setJoinBlockedReason("invite");
        if (useClientPrefsStore.getState().lastSessionId === sessionId) {
          clearLastSessionId();
        }
        return;
      }

      const expectedEpoch = connectEpoch;
      const joinToken = await resolveJoinToken(sessionId);
      if (cancelled || expectedEpoch !== connectEpoch) {
        return;
      }
      if (!joinToken) {
        setStatus("connecting");
        dispatchConnectionEvent({ type: "disconnected", reason: "join-token" });
        return;
      }

      lastConnectEpoch.current = connectEpoch;

      const nextGeneration = connectionGeneration.current + 1;
      const getDisconnectGuard = () => {
        if (cancelled) return { ok: false, reason: "cancelled" as const };
        if (pausedRef.current) return { ok: false, reason: "paused" as const };
        if (connectionGeneration.current !== nextGeneration) {
          return {
            ok: false,
            reason: "generation-mismatch" as const,
            current: connectionGeneration.current,
            expected: nextGeneration,
          };
        }
        return { ok: true as const };
      };
      const shouldHandleDisconnect = () => getDisconnectGuard().ok;

      const handleDisconnect = (event?: { code?: number; reason?: string } | null) => {
        const guard = getDisconnectGuard();
        if (!guard.ok) {
          return;
        }
        if (event?.code === 1008) return;
        if (isRoomResetClose(event)) {
          applyRoomUnavailable();
          return;
        }
        clearConnectAttemptTimer();
        setStatus("connecting");
        dispatchConnectionEvent({
          type: "disconnected",
          reason: isRateLimitedClose(event) ? "rate-limit" : "close",
        });

        const activeResources = resourcesRef.current;
        if (activeResources) {
          disableProviderAutoReconnect(activeResources.provider as any);
          teardownSessionResources(sessionId, {
            awareness: activeResources.awareness,
            provider: activeResources.provider,
            intentTransport: activeResources.intentTransport,
          });
          resourcesRef.current = null;
        }
        resetIntentCloseTracking();
        connectionGeneration.current += 1;
      };

      const maybeTriggerIntentFallback = () => {
        if (!shouldHandleDisconnect()) {
          return;
        }
        if (intentClosedAtRef.current === null) return;
        const elapsed = Date.now() - intentClosedAtRef.current;
        if (elapsed < INTENT_DISCONNECT_GRACE_MS) return;
        handleDisconnect({ code: 1006, reason: "intent-timeout" });
      };

      const handleIntentClose = (event?: CloseEvent) => {
        if (!shouldHandleDisconnect()) return;
        if (isRateLimitedClose(event) || isRoomResetClose(event)) {
          handleDisconnect(event);
          return;
        }
        intentClosedAtRef.current = Date.now();
        if (intentCloseTimer.current) {
          clearTimeout(intentCloseTimer.current);
        }
        intentCloseTimer.current = setTimeout(() => {
          intentCloseTimer.current = null;
          maybeTriggerIntentFallback();
        }, INTENT_DISCONNECT_GRACE_MS);
      };

      const handleIntentOpen = () => {
        resetIntentCloseTracking();
        clearConnectAttemptTimer();
        if (attemptJoinRef.current) {
          attemptJoinRef.current();
        } else {
          pendingIntentJoinRef.current = true;
        }
      };

      const resources = setupSessionResources({
        sessionId,
        statusSetter: setStatus,
        onIntentClose: handleIntentClose,
        onIntentOpen: handleIntentOpen,
        joinToken,
        onAuthFailure: (reason) => {
          if (authFailureHandled.current) return;
          authFailureHandled.current = true;
          emitConnectionLog("connection.authFailure", { reason });
          const priorEvidence = priorSessionEvidenceRef.current;
          const shouldTreatAsUnavailable =
            reason === "invalid token" &&
            priorEvidence.sessionId === sessionId &&
            (priorEvidence.hasTokens || priorEvidence.hadLastSession);
          if (shouldTreatAsUnavailable) {
            applyRoomUnavailable();
            return;
          }

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
          resetIntentCloseTracking();
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
      if (pendingIntentJoinRef.current) {
        pendingIntentJoinRef.current = false;
        attemptJoin();
      }

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
          clearConnectAttemptTimer();
          pushLocalAwareness();
          dispatchConnectionEvent({ type: "connected" });
        }
        if (s === "disconnected") {
          dispatchConnectionEvent({ type: "status-disconnected" });
          maybeTriggerIntentFallback();
        }
      });

      if ("on" in provider && typeof provider.on === "function") {
        provider.on("connection-close", (event: CloseEvent) => {
          handleDisconnect(event);
        });
        provider.on("connection-error", (event: Event) => {
          handleDisconnect(event as any);
        });
      }

      provider.on("sync", (isSynced: boolean) => {
        if (!isSynced) return;
        scheduleDebouncedTimeout(postSyncFullSyncTimer, 50, fullSyncToStore);
        scheduleDebouncedTimeout(postSyncInitTimer, 60, attemptJoin);
      });

      cleanup = () => {
        if (cleanedUp) return;
        cleanedUp = true;
        disposeAwareness();
        awarenessRef.current = null;
        localPlayerIdRef.current = null;
        resetIntentCloseTracking();
        clearConnectAttemptTimer();

        awareness.off("change", handleAwarenessChange);
        doc.off("update", handleDocUpdate);
        cancelDebouncedTimeout(fullSyncTimer);
        cancelDebouncedTimeout(postSyncFullSyncTimer);
        cancelDebouncedTimeout(postSyncInitTimer);

        teardownSessionResources(sessionId, { awareness, provider, intentTransport });
        resourcesRef.current = null;
        connectionGeneration.current += 1;

        attemptJoinRef.current = null;
      };

      clearConnectAttemptTimer();
      connectAttemptTimer.current = setTimeout(() => {
        connectAttemptTimer.current = null;
        handleDisconnect({ code: 1006, reason: "connect-timeout" });
      }, 12_000);

      await provider.connect?.();
      if (cancelled || cleanedUp || connectionGeneration.current !== nextGeneration) {
        return;
      }
      disableProviderAutoReconnect(provider as any);
      intentTransport.connect?.();
    };

    void run();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [
    sessionId,
    hasHydrated,
    viewerRole,
    connectEpoch,
    isPaused,
    setLastSessionId,
    clearLastSessionId,
    locationKey,
  ]);

  return { status, peerCounts, joinBlocked, joinBlockedReason };
}
