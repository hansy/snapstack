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
  const awarenessRef = useRef<SessionSetupResult["awareness"] | null>(null);
  const localPlayerIdRef = useRef<string | null>(null);
  const fullSyncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const postSyncFullSyncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const postSyncInitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptJoinRef = useRef<(() => void) | null>(null);
  const resourcesRef = useRef<SessionSetupResult | null>(null);
  const authFailureHandled = useRef(false);
  const setLastSessionId = useClientPrefsStore((state) => state.setLastSessionId);
  const clearLastSessionId = useClientPrefsStore((state) => state.clearLastSessionId);

  useEffect(() => {
    attemptJoinRef.current?.();
    const awareness = awarenessRef.current;
    const playerId = localPlayerIdRef.current;
    if (awareness && playerId) {
      awareness.setLocalStateField("client", { id: playerId, role: viewerRole });
    }
  }, [viewerRole]);

  useEffect(() => {
    if (!sessionId) return;
    if (typeof window === "undefined") return;
    if (!hasHydrated) return;

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
      const activeResources = resourcesRef.current;
      if (activeResources) {
        teardownSessionResources(sessionId, {
          awareness: activeResources.awareness,
          provider: activeResources.provider,
          intentTransport: activeResources.intentTransport,
        });
        resourcesRef.current = null;
      }
      setJoinBlocked(true);
      setJoinBlockedReason("invite");
      if (useClientPrefsStore.getState().lastSessionId === sessionId) {
        clearLastSessionId();
      }
      return;
    }

    const resources = setupSessionResources({
      sessionId,
      statusSetter: setStatus,
      onAuthFailure: () => {
        if (authFailureHandled.current) return;
        authFailureHandled.current = true;
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
        }
      },
    });

    if (!resources) return;
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
      if (s === "connected") {
        pushLocalAwareness();
      }
    });

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

      teardownSessionResources(sessionId, { awareness, provider, intentTransport });
      resourcesRef.current = null;

      attemptJoinRef.current = null;
    };
  }, [
    sessionId,
    hasHydrated,
    viewerRole,
    setLastSessionId,
    clearLastSessionId,
  ]);

  return { status, peerCounts, joinBlocked, joinBlockedReason };
}
