/**
 * WebSocket-based Yjs sync via the Cloudflare Durable Object relay.
 *
 * This keeps transport simple and reliable: one server relay, one provider.
 */
import { useEffect, useRef, useState } from "react";
import type { Awareness } from "y-protocols/awareness";
import { useGameStore } from "@/store/gameStore";
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

export type SyncStatus = "connecting" | "connected";
type JoinBlockedReason = NonNullable<LocalPlayerInitResult>["reason"] | null;

const CLIENT_VERSION = "web-3-ws";

export function useMultiplayerSync(sessionId: string) {
  const hasHydrated = useGameStore((state) => state.hasHydrated);
  const viewerRole = useGameStore((state) => state.viewerRole);
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

    const resources = setupSessionResources({
      sessionId,
      statusSetter: setStatus,
    });

    if (!resources) return;

    const { awareness, provider, sharedMaps, ensuredPlayerId, fullSyncToStore, doc } = resources;
    awarenessRef.current = awareness;
    localPlayerIdRef.current = ensuredPlayerId;

    const attemptJoin = createAttemptJoin({
      docTransact: (fn) => doc.transact(fn),
      sharedMaps,
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

      teardownSessionResources(sessionId, { awareness, provider });

      attemptJoinRef.current = null;
    };
  }, [sessionId, hasHydrated]);

  return { status, peerCounts, joinBlocked, joinBlockedReason };
}
