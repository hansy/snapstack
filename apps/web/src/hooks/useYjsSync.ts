import { useEffect, useMemo, useRef, useState } from "react";
import { WebsocketProvider } from "y-websocket";
import { Awareness, removeAwarenessStates } from "y-protocols/awareness";
import { useGameStore } from "../store/gameStore";
import { bindSharedLogStore } from "../logging/logStore";
import { createGameYDoc } from "../yjs/yDoc";
import { flushPendingSharedMutations, getYDocHandles, setYDocHandles, setYProvider } from "../yjs/yManager";
import {
  clampNormalizedPosition,
  migratePositionToNormalized,
} from "../lib/positions";
import type { Card, Counter, Player, Zone } from "../types";

type SyncStatus = "connecting" | "connected";

const MAX_PLAYERS = 8;
const MAX_ZONES = MAX_PLAYERS * 10; // 6 zones per seat (library, hand, battlefield, graveyard, exile, commander)
const MAX_CARDS = 600;
const MAX_CARDS_PER_ZONE = 200;
const MAX_COUNTERS = 24;
const MAX_NAME_LENGTH = 120;
const CLIENT_KEY_STORAGE = "mtg:client-key";
const CLIENT_VERSION = "web-1";

const genUuidLike = () => {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

const getClientKey = () => {
  if (typeof window === "undefined") return "server";
  try {
    const existing = window.sessionStorage.getItem(CLIENT_KEY_STORAGE);
    if (existing) return existing;
    const next = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : genUuidLike();
    window.sessionStorage.setItem(CLIENT_KEY_STORAGE, next);
    return next;
  } catch (_err) {
    return genUuidLike();
  }
};

// Debug logging with timestamps (disabled in normal operation)
const DEBUG_SYNC = false;
const syncLog = (...args: any[]) => {
  if (!DEBUG_SYNC) return;
  const now = performance.now().toFixed(1);
  console.log(`[sync ${now}ms]`, ...args);
};

export function useYjsSync(sessionId: string) {
  const applyingRemote = useRef(false);
  const prevSession = useRef<string | null>(null);
  const [status, setStatus] = useState<SyncStatus>("connecting");
  const [peers, setPeers] = useState(1);

  // Build doc/maps once per hook instance
  const handles = useMemo(() => createGameYDoc(), []);

  const ENABLE_LOG_SYNC = true; // re-enabled now that drawer is stable

  useEffect(() => {
    if (!sessionId) return;
    if (typeof window === "undefined") return;

    setStatus("connecting");
    setPeers(1);

    const store = useGameStore.getState();
    const ensuredPlayerId = store.ensurePlayerIdForSession(sessionId);
    const sessionVersion = store.ensureSessionVersion(sessionId);
    const needsReset = store.sessionId !== sessionId || store.myPlayerId !== ensuredPlayerId;
    if (needsReset) {
      store.resetSession(sessionId, ensuredPlayerId);
    } else {
      // Keep sessionId in sync in case it drifted.
      useGameStore.setState((state) => ({ ...state, sessionId }));
    }
    prevSession.current = sessionId;

    const signalingUrl = (() => {
      const envUrl = (import.meta as any).env?.VITE_WEBSOCKET_SERVER as
        | string
        | undefined;
      if (!envUrl) {
        console.error(
          "[signal] VITE_WEBSOCKET_SERVER is required for websocket signaling"
        );
        return null;
      }
      const normalized = envUrl.replace(/^http/, "ws").replace(/\/$/, "");
      return normalized.endsWith("/signal")
        ? normalized
        : `${normalized}/signal`;
    })();
    if (!signalingUrl) return;

    const { doc, players, zones, cards, globalCounters, logs } = handles;
    setYDocHandles(handles);
    if (ENABLE_LOG_SYNC) bindSharedLogStore(logs);
    const awareness = new Awareness(doc);
    const room = sessionId;
    const clientKey = getClientKey();
    
    // Log doc-level updates to see when data arrives from network
    doc.on("update", (update: Uint8Array, origin: any) => {
      const isLocal = origin === doc.clientID || origin === "local";
      syncLog("DOC UPDATE", { 
        bytes: update.byteLength, 
        origin: isLocal ? "local" : "remote",
        playersSize: players.size,
        zonesSize: zones.size,
        cardsSize: cards.size 
      });
    });

    const provider = new WebsocketProvider(signalingUrl, room, doc, {
      awareness,
      connect: true,
      params: {
        userId: ensuredPlayerId,
        clientKey,
        sessionVersion: String(sessionVersion),
        clientVersion: CLIENT_VERSION,
      },
    });
    setYProvider(provider);
    syncLog("PROVIDER created", { room: sessionId, userId: ensuredPlayerId });
    
    provider.on("connection-close", (evt: any) => {
      const raw = Array.isArray(evt) ? evt[0] : evt;
      if (raw && typeof raw.code === "number") {
        syncLog("CONNECTION CLOSED", { code: raw.code, reason: raw.reason || "" });
      }
    });
    provider.on("connection-error", (evt: any) => {
      syncLog("CONNECTION ERROR", evt);
    });
    provider.on("status", ({ status: s }: any) => {
      syncLog("STATUS changed", { status: s });
    });
    provider.on("sync", (isSynced: boolean) => {
      syncLog("SYNC event", { isSynced });
    });

    const clampNumber = (
      value: unknown,
      min: number,
      max: number,
      fallback: number
    ) => {
      if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
      return Math.min(Math.max(value, min), max);
    };

    const normalizePosition = (pos: any) => {
      if (!pos || typeof pos.x !== "number" || typeof pos.y !== "number") {
        return { x: 0.5, y: 0.5 };
      }
      const needsMigration = pos.x > 1 || pos.y > 1;
      const next = needsMigration
        ? migratePositionToNormalized(pos)
        : clampNormalizedPosition(pos);
      return { x: next.x, y: next.y };
    };

    const sanitizeCounters = (value: any): Counter[] => {
      if (!Array.isArray(value)) return [];
      const result: Counter[] = [];
      for (const c of value) {
        if (!c || typeof c.type !== "string") continue;
        const count = clampNumber(c.count, 0, 999, 0);
        const counter: Counter = { type: c.type.slice(0, 64), count };
        if (typeof c.color === "string") counter.color = c.color.slice(0, 32);
        result.push(counter);
        if (result.length >= MAX_COUNTERS) break;
      }
      return result;
    };

    const sanitizePlayers = () => {
      const result: Record<string, Player> = {};
      let processed = 0;
      players.forEach((value, key) => {
        if (processed >= MAX_PLAYERS) return;
        if (!value || typeof key !== "string") return;
        if (typeof value.id !== "string") return;
        const id = value.id;
        const name =
          typeof value.name === "string" && value.name.trim().length
            ? value.name.slice(0, MAX_NAME_LENGTH)
            : `Player ${id.slice(0, 4)}`;
        const commanderDamage: Record<string, number> = {};
        if (
          value.commanderDamage &&
          typeof value.commanderDamage === "object"
        ) {
          Object.entries(value.commanderDamage).forEach(([pid, dmg]) => {
            if (typeof pid === "string") {
              commanderDamage[pid] = clampNumber(dmg, 0, 999, 0);
            }
          });
        }
        result[id] = {
          id,
          name,
          life: clampNumber(value.life, -999, 999, 40),
          color:
            typeof value.color === "string"
              ? value.color.slice(0, 16)
              : undefined,
          cursor:
            value.cursor &&
            typeof value.cursor.x === "number" &&
            typeof value.cursor.y === "number"
              ? { x: value.cursor.x, y: value.cursor.y }
              : undefined,
          counters: sanitizeCounters(value.counters),
          commanderDamage,
          commanderTax: clampNumber(value.commanderTax, 0, 99, 0),
          deckLoaded: Boolean(value.deckLoaded),
        };
        processed += 1;
      });
      return result;
    };

    const sanitizeZones = () => {
      const result: Record<string, Zone> = {};
      let processed = 0;
      zones.forEach((value, key) => {
        if (processed >= MAX_ZONES) return;
        if (!value || typeof key !== "string") return;
        if (typeof value.id !== "string" || typeof value.ownerId !== "string")
          return;
        if (
          ![
            "library",
            "hand",
            "battlefield",
            "graveyard",
            "exile",
            "commander",
          ].includes(value.type)
        )
          return;
        const ids: string[] = Array.isArray(value.cardIds)
          ? Array.from(
              new Set<string>(
                (value.cardIds as unknown[]).filter(
                  (cardId): cardId is string => typeof cardId === "string"
                )
              )
            ).slice(0, MAX_CARDS_PER_ZONE)
          : [];
        result[key] = {
          id: value.id,
          type: value.type,
          ownerId: value.ownerId,
          cardIds: ids,
        };
        processed += 1;
      });
      return result;
    };

    const sanitizeCards = (safeZones: Record<string, Zone>) => {
      const result: Record<string, Card> = {};
      let processed = 0;
      cards.forEach((value, key) => {
        if (processed >= MAX_CARDS) return;
        if (!value || typeof key !== "string") return;
        if (typeof value.id !== "string" || typeof value.zoneId !== "string")
          return;
        if (!safeZones[value.zoneId]) return;
        if (
          typeof value.ownerId !== "string" ||
          typeof value.controllerId !== "string"
        )
          return;
        const counters = sanitizeCounters(value.counters);
        const position = normalizePosition(value.position);
        const rotation = clampNumber(value.rotation, -360, 360, 0);
        const faceIndex =
          typeof value.currentFaceIndex === "number" &&
          Number.isFinite(value.currentFaceIndex)
            ? Math.max(0, Math.floor(value.currentFaceIndex))
            : 0;
        result[key] = {
          id: value.id,
          ownerId: value.ownerId,
          controllerId: value.controllerId,
          zoneId: value.zoneId,
          tapped: Boolean(value.tapped),
          faceDown: Boolean(value.faceDown),
          currentFaceIndex: faceIndex,
          position,
          rotation,
          counters,
          name:
            typeof value.name === "string"
              ? value.name.slice(0, MAX_NAME_LENGTH)
              : "Card",
          imageUrl:
            typeof value.imageUrl === "string" ? value.imageUrl : undefined,
          oracleText:
            typeof value.oracleText === "string" ? value.oracleText : undefined,
          typeLine:
            typeof value.typeLine === "string" ? value.typeLine : undefined,
          scryfallId:
            typeof value.scryfallId === "string" ? value.scryfallId : undefined,
          scryfall: value.scryfall,
          isToken: value.isToken === true,
          power:
            typeof value.power === "string"
              ? value.power
              : value.power?.toString(),
          toughness:
            typeof value.toughness === "string"
              ? value.toughness
              : value.toughness?.toString(),
          basePower:
            typeof value.basePower === "string"
              ? value.basePower
              : value.basePower?.toString(),
          baseToughness:
            typeof value.baseToughness === "string"
              ? value.baseToughness
              : value.baseToughness?.toString(),
          customText:
            typeof value.customText === "string"
              ? value.customText.slice(0, 280)
              : undefined,
        };
        processed += 1;
      });
      return result;
    };

    const sanitizeGlobalCounters = () => {
      const result: Record<string, string> = {};
      globalCounters.forEach((value, key) => {
        if (typeof key !== "string") return;
        if (typeof value !== "string") return;
        result[key.slice(0, 64)] = value.slice(0, 16);
      });
      return result;
    };

    const syncStoreToShared = () => {
      const handles = getYDocHandles();
      if (!handles) return;
      const state = useGameStore.getState();
      const syncMap = (data: Record<string, any>, map: any) => {
        map.forEach((_value: any, key: string) => {
          if (!Object.prototype.hasOwnProperty.call(data, key)) map.delete(key);
        });
        Object.entries(data).forEach(([key, value]) => map.set(key, value as any));
      };
      handles.doc.transact(() => {
        syncMap(state.players, handles.players);
        syncMap(state.zones, handles.zones);
        syncMap(state.cards, handles.cards);
        syncMap(state.globalCounters, handles.globalCounters);
      });
      console.log("[signal] syncStoreToShared", {
        ts: Date.now(),
        players: Object.keys(state.players).length,
        zones: Object.keys(state.zones).length,
        cards: Object.keys(state.cards).length,
        globalCounters: Object.keys(state.globalCounters).length,
      });
    };

    const pushRemoteToStore = () => {
      const startTime = performance.now();
      syncLog("pushRemoteToStore START");
      
      const safePlayers = sanitizePlayers();
      const safeZones = sanitizeZones();
      const safeCards = sanitizeCards(safeZones);
      const zonesWithExistingCards = Object.fromEntries(
        Object.entries(safeZones).map(([id, zone]) => [
          id,
          {
            ...zone,
            cardIds: zone.cardIds
              .filter((cardId) => Boolean(safeCards[cardId]))
              .slice(0, MAX_CARDS_PER_ZONE),
          },
        ])
      );
      const safeGlobalCounters = sanitizeGlobalCounters();
      
      const sanitizeTime = performance.now() - startTime;
      syncLog("pushRemoteToStore SANITIZED", {
        sanitizeMs: sanitizeTime.toFixed(1),
        players: Object.keys(safePlayers).length,
        zones: Object.keys(safeZones).length,
        cards: Object.keys(safeCards).length,
        globalCounters: Object.keys(safeGlobalCounters).length,
      });
      
      applyingRemote.current = true;
      useGameStore.setState((current) => ({
        ...current,
        players: safePlayers,
        zones: zonesWithExistingCards,
        cards: safeCards,
        globalCounters: safeGlobalCounters,
      }));
      applyingRemote.current = false;
      
      const totalTime = performance.now() - startTime;
      syncLog("pushRemoteToStore DONE", { totalMs: totalTime.toFixed(1) });
    };

    const pushLocalAwareness = () => {
      const localId = useGameStore.getState().myPlayerId;
      awareness.setLocalStateField("client", { id: localId });
    };

    // Simple debounce - coalesce rapid changes without causing render loops
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let pendingChanges = 0;
    
    const handleMapChange = (mapName: string) => () => {
      pendingChanges++;
      const changeId = pendingChanges;
      syncLog(`OBSERVER fired: ${mapName}`, { changeId, hadPending: !!debounceTimer });
      
      // Clear any pending update
      if (debounceTimer) clearTimeout(debounceTimer);
      
      // Schedule update for next frame
      debounceTimer = setTimeout(() => {
        syncLog(`DEBOUNCE expired, executing pushRemoteToStore`, { changeId, pendingChanges });
        debounceTimer = null;
        pushRemoteToStore();
      }, 50); // 50ms debounce to batch rapid updates
    };

    // Advertise local presence (player id for now)
    pushLocalAwareness();

    const playersObserver = handleMapChange("players");
    const zonesObserver = handleMapChange("zones");
    const cardsObserver = handleMapChange("cards");
    const globalCountersObserver = handleMapChange("globalCounters");
    
    players.observe(playersObserver);
    zones.observe(zonesObserver);
    cards.observe(cardsObserver);
    globalCounters.observe(globalCountersObserver);
    
    syncLog("OBSERVERS registered");

    // Apply any queued mutations now that observers are live
    flushPendingSharedMutations();

    provider.on("status", ({ status: s }: any) => {
      if (s === "connected") {
        setStatus("connected");
        flushPendingSharedMutations();
        const handles = getYDocHandles();
        if (handles) {
          const localCards = Object.keys(useGameStore.getState().cards).length;
          if (handles.cards.size === 0 && localCards > 0) {
            syncStoreToShared();
          }
        }
        // Re-broadcast our awareness after connection to ensure peers see us immediately.
        pushLocalAwareness();
        setTimeout(() => pushLocalAwareness(), 10);
      }
      if (s === "disconnected") setStatus("connecting");
    });

    provider.on("sync", (isSynced: boolean) => {
      syncLog("SYNC handler called", { isSynced });
      if (!isSynced) return;
      // When the provider finishes initial sync, apply any queued mutations.
      // NOTE: Don't call pushRemoteToStore here - the sync event fires before 
      // data is actually applied to Yjs maps. The observers will handle it.
      syncLog("SYNC complete - flushing pending mutations");
      flushPendingSharedMutations();
      const handles = getYDocHandles();
      if (handles) {
        const localCards = Object.keys(useGameStore.getState().cards).length;
        syncLog("SYNC complete - checking if need to push local", { localCards, remoteCards: handles.cards.size });
        if (handles.cards.size === 0 && localCards > 0) {
          syncLog("SYNC complete - pushing local to shared");
          syncStoreToShared();
        }
      }
      // Schedule a delayed push to catch any data that arrives after sync event
      // This gives time for Yjs to process incoming updates
      setTimeout(() => {
        syncLog("SYNC delayed push - executing");
        pushRemoteToStore();
      }, 100);
    });

    const handleAwareness = () => {
      const size = awareness.getStates().size || 1;
      setPeers(size);
    };

    awareness.on("change", handleAwareness);
    handleAwareness();

    return () => {
      syncLog("CLEANUP starting");
      
      // Clear debounce timer
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      
      // On disconnect/unmount, drop presence and transport only. Seat data stays until an explicit leave action.
      awareness.setLocalState(null);
      try {
        // Best-effort broadcast of awareness removal before disconnecting so peers drop us immediately.
        const clientId = awareness.clientID;
        removeAwarenessStates(awareness, [clientId], "disconnect");
      } catch (_err) {}

      awareness.off("change", handleAwareness);
      players.unobserve(playersObserver);
      zones.unobserve(zonesObserver);
      cards.unobserve(cardsObserver);
      globalCounters.unobserve(globalCountersObserver);
      syncLog("CLEANUP - unobserved all maps");
      if (ENABLE_LOG_SYNC) bindSharedLogStore(null);
      setYDocHandles(null);
      setYProvider(null);
      
      // Disconnect the provider but DON'T destroy the doc!
      // The doc is memoized and may be reused by a new provider (React StrictMode double-mount).
      // Destroying the doc would break subsequent providers using the same doc reference.
      setTimeout(() => {
        syncLog("CLEANUP - disconnecting provider (doc preserved)");
        provider.disconnect();
        provider.destroy();
        // NOTE: We intentionally do NOT call doc.destroy() here.
        // The doc persists and can be reconnected by a new provider.
      }, 25);
    };
  }, [handles, sessionId]);

  return { status, peers };
}
