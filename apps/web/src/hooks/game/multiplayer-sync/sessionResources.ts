import type * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";
import YPartyKitProvider from "y-partykit/provider";
import { toast } from "sonner";
import { clearLogs, emitLog } from "@/logging/logStore";
import { ZONE } from "@/constants/zones";
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
      ? "localhost:1999"
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
  const provider: YSyncProvider = new YPartyKitProvider(
    partyHost,
    sessionId,
    doc,
    {
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

  const debugIntent = import.meta.env.DEV;
  let loggedOverlay = false;
  let loggedRoomTokens = false;
  let loggedAck = false;
  let lastOverlaySummary:
    | { cardCount: number; cardsWithArt: number; handCount: number }
    | null = null;
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
    onOpen: () => {
      if (!debugIntent) return;
      console.info("[party] intent connected", {
        host: partyHost,
        room: sessionId,
        viewerRole: intentViewerRole,
        playerId: ensuredPlayerId,
        hasToken: Boolean(token),
      });
    },
    onMessage: (message) => {
      if (message.type === "ack") {
        if (debugIntent && (!loggedAck || !message.ok)) {
          loggedAck = true;
          console.info("[party] intent ack received", {
            room: sessionId,
            intentId: message.intentId,
            ok: message.ok,
            error: message.error,
          });
        }
        const error = handleIntentAck(message, useGameStore.setState);
        if (error) {
          toast.error(error);
        }
        return;
      }
      if (message.type === "roomTokens") {
        if (debugIntent && !loggedRoomTokens) {
          loggedRoomTokens = true;
          console.info("[party] intent room tokens received", {
            room: sessionId,
            viewerRole: intentViewerRole,
            hasPlayerToken: Boolean(message.payload?.playerToken),
            hasSpectatorToken: Boolean(message.payload?.spectatorToken),
          });
        }
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
        const payloadCards = Array.isArray(message.payload?.cards)
          ? message.payload.cards
          : [];
        const cardsWithArt = payloadCards.filter(
          (card) => typeof card.imageUrl === "string" && card.imageUrl.length > 0
        ).length;
        const state = useGameStore.getState();
        const myPlayerId = state.myPlayerId;
        const handZone = Object.values(state.zones).find(
          (zone) => zone.type === ZONE.HAND && zone.ownerId === myPlayerId
        );
        const handCount = Array.isArray(handZone?.cardIds) ? handZone.cardIds.length : 0;
        if (debugIntent) {
          const summary = { cardCount: payloadCards.length, cardsWithArt, handCount };
          const shouldLogSummary =
            !lastOverlaySummary ||
            lastOverlaySummary.cardCount !== summary.cardCount ||
            lastOverlaySummary.cardsWithArt !== summary.cardsWithArt ||
            lastOverlaySummary.handCount !== summary.handCount ||
            (summary.handCount > 0 && summary.cardCount === 0);
          if (shouldLogSummary) {
            const sampleCard = payloadCards[0];
            console.info("[party] intent private overlay received", {
              room: sessionId,
              ...summary,
              sample: !loggedOverlay && sampleCard
                ? {
                    id: sampleCard.id,
                    name: sampleCard.name,
                    imageUrl: sampleCard.imageUrl,
                    zoneId: sampleCard.zoneId,
                    ownerId: sampleCard.ownerId,
                    faceDown: sampleCard.faceDown,
                  }
                : null,
            });
            loggedOverlay = true;
            lastOverlaySummary = summary;
          }
        }
        pendingOverlay = message.payload as PrivateOverlayPayload;
        scheduleOverlayFlush();
        return;
      }
      if (message.type === "logEvent") {
        if (debugIntent) {
          console.info("[party] intent log event received", {
            room: sessionId,
            eventId: message.eventId,
            actorId: (message.payload as { actorId?: string })?.actorId,
          });
        }
        const { players, cards, zones } = useGameStore.getState();
        emitLog(message.eventId as any, message.payload as any, {
          players,
          cards,
          zones,
        });
      }
    },
    onClose: (event) => {
      if (debugIntent) {
        console.warn("[party] intent disconnected", {
          room: sessionId,
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean,
        });
      }
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
