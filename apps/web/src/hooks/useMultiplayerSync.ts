/**
 * WebSocket-based Yjs sync via the Cloudflare Durable Object relay.
 *
 * This keeps transport simple and reliable: one server relay, one provider.
 */
import { useEffect, useRef, useState } from "react";
import { WebsocketProvider } from "y-websocket";
import { Awareness, removeAwarenessStates } from "y-protocols/awareness";
import { useGameStore } from "../store/gameStore";
import { bindSharedLogStore } from "../logging/logStore";
import { ZONE } from "../constants/zones";
import {
  acquireSession,
  cleanupStaleSessions,
  getSessionAwareness,
  getSessionProvider,
  releaseSession,
  setSessionProvider,
  setSessionAwareness,
  setActiveSession,
  flushPendingMutations,
} from "../yjs/docManager";
import {
  patchPlayer,
  sharedSnapshot,
  type SharedMaps,
  upsertPlayer,
  upsertZone,
} from "../yjs/yMutations";
import {
  isApplyingRemoteUpdate,
  sanitizeSharedSnapshot,
  withApplyingRemoteUpdate,
} from "../yjs/sync";
import {
  computePlayerColors,
  resolveOrderedPlayerIds,
} from "../lib/playerColors";
import { normalizeUsernameInput, useClientPrefsStore } from "../store/clientPrefsStore";

export type SyncStatus = "connecting" | "connected";

const CLIENT_KEY_STORAGE = "mtg:client-key";
const CLIENT_VERSION = "web-3-ws";

const genUuidLike = () => {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

const getClientKey = () => {
  if (typeof window === "undefined") return "server";
  try {
    const existing = window.sessionStorage.getItem(CLIENT_KEY_STORAGE);
    if (existing) return existing;
    const next =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : genUuidLike();
    window.sessionStorage.setItem(CLIENT_KEY_STORAGE, next);
    return next;
  } catch (_err) {
    return genUuidLike();
  }
};

const buildSignalingUrl = (): string | null => {
  const envUrl = (import.meta as any).env?.VITE_WEBSOCKET_SERVER as
    | string
    | undefined;
  if (!envUrl) {
    console.error("[signal] VITE_WEBSOCKET_SERVER is required");
    return null;
  }
  const normalized = envUrl.replace(/^http/, "ws").replace(/\/$/, "");
  return normalized.endsWith("/signal") ? normalized : `${normalized}/signal`;
};

export function useMultiplayerSync(sessionId: string) {
  const hasHydrated = useGameStore((state) => state.hasHydrated);
  const [status, setStatus] = useState<SyncStatus>("connecting");
  const [peers, setPeers] = useState(1);
  const fullSyncTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    if (typeof window === "undefined") return;
    if (!hasHydrated) return;

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
    } = handles;

    const sharedMaps: SharedMaps = {
      players,
      playerOrder,
      zones,
      cards,
      zoneCardOrders,
      globalCounters,
      battlefieldViewScale,
    } as any;

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
    const sessionVersion = useGameStore.getState().ensureSessionVersion(sessionId);

    const signalingUrl = buildSignalingUrl();
    if (!signalingUrl) return;

    bindSharedLogStore(logs);

    const awareness = new Awareness(doc);
    const clientKey = getClientKey();

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

    setSessionProvider(sessionId, provider);
    setSessionAwareness(sessionId, awareness);

    const fullSyncToStore = () => {
      if (fullSyncTimer.current !== null) {
        clearTimeout(fullSyncTimer.current);
        fullSyncTimer.current = null;
      }
      withApplyingRemoteUpdate(() => {
        const snapshot = sharedSnapshot(sharedMaps as any);
        const safe = sanitizeSharedSnapshot(snapshot as any);
        useGameStore.setState(safe);
      });
    };

    const ensureLocalPlayerInitialized = () => {
      const snapshot = sharedSnapshot(sharedMaps as any);
      const playerId = ensuredPlayerId;
      const defaultName = `Player ${playerId.slice(0, 4).toUpperCase()}`;
      const desiredName =
        normalizeUsernameInput(useClientPrefsStore.getState().username) ??
        defaultName;

      const playerExists = Boolean(snapshot.players[playerId]);
      const hasZoneOfType = (type: string) =>
        Object.values(snapshot.zones).some((z) => z.ownerId === playerId && (z as any).type === type);

      // Support legacy "command" zone type when deciding whether to create commander.
      const hasCommanderZone = hasZoneOfType(ZONE.COMMANDER) || hasZoneOfType("command");

      const zoneSpecs: Array<{ type: string; shouldCreate: boolean }> = [
        { type: ZONE.LIBRARY, shouldCreate: !hasZoneOfType(ZONE.LIBRARY) },
        { type: ZONE.HAND, shouldCreate: !hasZoneOfType(ZONE.HAND) },
        { type: ZONE.BATTLEFIELD, shouldCreate: !hasZoneOfType(ZONE.BATTLEFIELD) },
        { type: ZONE.GRAVEYARD, shouldCreate: !hasZoneOfType(ZONE.GRAVEYARD) },
        { type: ZONE.EXILE, shouldCreate: !hasZoneOfType(ZONE.EXILE) },
        { type: ZONE.COMMANDER, shouldCreate: !hasCommanderZone },
      ];

      const orderedIds = resolveOrderedPlayerIds(
        snapshot.players as any,
        (snapshot.playerOrder as any) ?? []
      );
      const orderedIdsWithLocal = orderedIds.includes(playerId)
        ? orderedIds
        : [...orderedIds, playerId];
      const desiredColors = computePlayerColors(orderedIdsWithLocal);

      const missingAnyColor = Object.values(snapshot.players).some(
        (p: any) => !p?.color
      );

      const currentName = snapshot.players?.[playerId]?.name;
      const needsNameUpdate = Boolean(
        desiredName &&
          desiredName !== currentName &&
          (!currentName || currentName === defaultName)
      );

      if (
        playerExists &&
        zoneSpecs.every((z) => !z.shouldCreate) &&
        !missingAnyColor &&
        !needsNameUpdate
      )
        return;

      doc.transact(() => {
        if (!playerExists) {
          upsertPlayer(sharedMaps, {
            id: playerId,
            name: desiredName,
            life: 40,
            counters: [],
            commanderDamage: {},
            commanderTax: 0,
            deckLoaded: false,
            color: desiredColors[playerId],
          } as any);
        } else {
          if (needsNameUpdate) {
            patchPlayer(sharedMaps, playerId, { name: desiredName } as any);
          }
        }

        Object.entries(desiredColors).forEach(([id, color]) => {
          const current = (snapshot.players as any)?.[id];
          if (!current?.color) {
            patchPlayer(sharedMaps, id, { color } as any);
          }
        });

        zoneSpecs.forEach(({ type, shouldCreate }) => {
          if (!shouldCreate) return;
          upsertZone(sharedMaps, {
            id: `${playerId}-${type}`,
            type: type as any,
            ownerId: playerId,
            cardIds: [],
          } as any);
        });
      });
    };

    const SYNC_DEBOUNCE_MS = 50;
    const scheduleFullSync = () => {
      if (fullSyncTimer.current !== null) {
        clearTimeout(fullSyncTimer.current);
      }
      fullSyncTimer.current = setTimeout(() => {
        fullSyncTimer.current = null;
        fullSyncToStore();
      }, SYNC_DEBOUNCE_MS) as unknown as number;
    };

    const handleDocUpdate = () => {
      if (isApplyingRemoteUpdate()) return;
      scheduleFullSync();
    };
    doc.on("update", handleDocUpdate);

    // Awareness
    const pushLocalAwareness = () => {
      awareness.setLocalStateField("client", { id: ensuredPlayerId });
    };
    pushLocalAwareness();

    const handleAwareness = () => {
      const states = awareness.getStates();
      const unique = new Set<string>();
      states.forEach((state: any, clientId: number) => {
        const userId = state?.client?.id;
        unique.add(typeof userId === "string" ? `u:${userId}` : `c:${clientId}`);
      });
      setPeers(Math.max(1, unique.size));
    };
    awareness.on("change", handleAwareness);
    handleAwareness();

    provider.on("status", ({ status: s }: any) => {
      if (s === "connected") {
        setStatus("connected");
        flushPendingMutations();
        pushLocalAwareness();
      }
      if (s === "disconnected") {
        setStatus("connecting");
      }
    });

    provider.on("sync", (isSynced: boolean) => {
      if (!isSynced) return;
      flushPendingMutations();
      setTimeout(() => fullSyncToStore(), 50);
      setTimeout(() => ensureLocalPlayerInitialized(), 60);
    });

    flushPendingMutations();

    return () => {
      awareness.setLocalState(null);
      try {
        removeAwarenessStates(awareness, [awareness.clientID], "disconnect");
      } catch (_err) {}

      awareness.off("change", handleAwareness);
      doc.off("update", handleDocUpdate);
      if (fullSyncTimer.current !== null) {
        clearTimeout(fullSyncTimer.current);
        fullSyncTimer.current = null;
      }

      bindSharedLogStore(null);
      setActiveSession(null);

      // Avoid clobbering a newer provider during fast remounts (e.g. React StrictMode).
      try {
        const currentProvider = getSessionProvider(sessionId);
        if (currentProvider === provider) {
          // Note: setSessionProvider(..., null) disconnects/destroys the existing provider.
          setSessionProvider(sessionId, null);
        } else {
          try {
            provider.disconnect();
            provider.destroy();
          } catch (_err) {}
        }
      } catch (_err) {}

      try {
        const currentAwareness = getSessionAwareness(sessionId);
        if (currentAwareness === awareness) {
          setSessionAwareness(sessionId, null);
        }
      } catch (_err) {}

      releaseSession(sessionId);
      cleanupStaleSessions();
    };
  }, [sessionId, hasHydrated]);

  return { status, peers };
}
