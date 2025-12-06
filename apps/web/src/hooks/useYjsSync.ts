import { useEffect, useRef, useState } from "react";
import { WebsocketProvider } from "y-websocket";
import { Awareness, removeAwarenessStates } from "y-protocols/awareness";
import * as Y from "yjs";
import { useGameStore } from "../store/gameStore";
import { bindSharedLogStore } from "../logging/logStore";
import {
  acquireSession,
  releaseSession,
  setSessionProvider,
  setSessionAwareness,
  setActiveSession,
  flushPendingMutations,
} from "../yjs/docManager";
import {
  clampNormalizedPosition,
  migratePositionToNormalized,
} from "../lib/positions";
import type { Card, Counter, Player, Zone } from "../types";

type SyncStatus = "connecting" | "connected";

// Limits for sanitization
// 4-player Commander = 400 base cards + tokens, so 800 gives headroom
const MAX_PLAYERS = 8;
const MAX_ZONES = MAX_PLAYERS * 10; // 80 zones
const MAX_CARDS = 800; // Increased from 600 for token-heavy games
const MAX_CARDS_PER_ZONE = 300; // Increased from 200 for battlefield with many tokens
const MAX_COUNTERS = 24;
const MAX_NAME_LENGTH = 120;

// Client identification
const CLIENT_KEY_STORAGE = "mtg:client-key";
const CLIENT_VERSION = "web-1";

// Flag to prevent feedback loops: Yjs -> Zustand -> Yjs
let applyingRemoteUpdate = false;

export function isApplyingRemoteUpdate(): boolean {
  return applyingRemoteUpdate;
}

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

// --- Sanitization helpers ---

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

const sanitizePlayer = (value: any): Player | null => {
  if (!value || typeof value.id !== "string") return null;
  const id = value.id;
  const name =
    typeof value.name === "string" && value.name.trim().length
      ? value.name.slice(0, MAX_NAME_LENGTH)
      : `Player ${id.slice(0, 4)}`;
  const commanderDamage: Record<string, number> = {};
  if (value.commanderDamage && typeof value.commanderDamage === "object") {
    Object.entries(value.commanderDamage).forEach(([pid, dmg]) => {
      if (typeof pid === "string") {
        commanderDamage[pid] = clampNumber(dmg, 0, 999, 0);
      }
    });
  }
  return {
    id,
    name,
    life: clampNumber(value.life, -999, 999, 40),
    color:
      typeof value.color === "string" ? value.color.slice(0, 16) : undefined,
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
};

const sanitizeZone = (value: any): Zone | null => {
  if (
    !value ||
    typeof value.id !== "string" ||
    typeof value.ownerId !== "string"
  )
    return null;
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
    return null;
  const ids: string[] = Array.isArray(value.cardIds)
    ? Array.from(
        new Set<string>(
          (value.cardIds as unknown[]).filter(
            (cardId): cardId is string => typeof cardId === "string"
          )
        )
      ).slice(0, MAX_CARDS_PER_ZONE)
    : [];
  return {
    id: value.id,
    type: value.type,
    ownerId: value.ownerId,
    cardIds: ids,
  };
};

const sanitizeCard = (value: any, zones: Record<string, Zone>): Card | null => {
  if (
    !value ||
    typeof value.id !== "string" ||
    typeof value.zoneId !== "string"
  )
    return null;
  if (!zones[value.zoneId]) return null;
  if (
    typeof value.ownerId !== "string" ||
    typeof value.controllerId !== "string"
  )
    return null;

  const counters = sanitizeCounters(value.counters);
  const position = normalizePosition(value.position);
  const rotation = clampNumber(value.rotation, -360, 360, 0);
  const faceIndex =
    typeof value.currentFaceIndex === "number" &&
    Number.isFinite(value.currentFaceIndex)
      ? Math.max(0, Math.floor(value.currentFaceIndex))
      : 0;

  return {
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
    imageUrl: typeof value.imageUrl === "string" ? value.imageUrl : undefined,
    oracleText:
      typeof value.oracleText === "string" ? value.oracleText : undefined,
    typeLine: typeof value.typeLine === "string" ? value.typeLine : undefined,
    scryfallId:
      typeof value.scryfallId === "string" ? value.scryfallId : undefined,
    scryfall: value.scryfall,
    isToken: value.isToken === true,
    power:
      typeof value.power === "string" ? value.power : value.power?.toString(),
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
};

export function useYjsSync(sessionId: string) {
  const [status, setStatus] = useState<SyncStatus>("connecting");
  const [peers, setPeers] = useState(1);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    if (typeof window === "undefined") return;

    // Acquire session from module-level manager (survives React double-mount)
    const handles = acquireSession(sessionId);
    setActiveSession(sessionId);

    const { doc, players, zones, cards, globalCounters, logs } = handles;

    // Setup store
    const store = useGameStore.getState();
    const ensuredPlayerId = store.ensurePlayerIdForSession(sessionId);
    const sessionVersion = store.ensureSessionVersion(sessionId);
    const needsReset =
      store.sessionId !== sessionId || store.myPlayerId !== ensuredPlayerId;
    if (needsReset) {
      store.resetSession(sessionId, ensuredPlayerId);
    } else {
      useGameStore.setState((state) => ({ ...state, sessionId }));
    }

    // Build signaling URL
    const signalingUrl = (() => {
      const envUrl = (import.meta as any).env?.VITE_WEBSOCKET_SERVER as
        | string
        | undefined;
      if (!envUrl) {
        console.error("[signal] VITE_WEBSOCKET_SERVER is required");
        return null;
      }
      const normalized = envUrl.replace(/^http/, "ws").replace(/\/$/, "");
      return normalized.endsWith("/signal")
        ? normalized
        : `${normalized}/signal`;
    })();
    if (!signalingUrl) return;

    // Bind log store
    bindSharedLogStore(logs);

    // Create awareness and provider
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

    // --- Incremental update handlers ---

    // Apply player changes incrementally
    const handlePlayersChange = (event: Y.YMapEvent<any>) => {
      if (applyingRemoteUpdate) return;

      applyingRemoteUpdate = true;
      try {
        const currentPlayers = { ...useGameStore.getState().players };
        let changed = false;

        event.changes.keys.forEach((change, key) => {
          if (change.action === "delete") {
            if (currentPlayers[key]) {
              delete currentPlayers[key];
              changed = true;
            }
          } else {
            const raw = players.get(key);
            const sanitized = sanitizePlayer(raw);
            if (sanitized) {
              currentPlayers[key] = sanitized;
              changed = true;
            }
          }
        });

        if (changed && Object.keys(currentPlayers).length <= MAX_PLAYERS) {
          useGameStore.setState({ players: currentPlayers });
        }
      } finally {
        applyingRemoteUpdate = false;
      }
    };

    // Apply zone changes incrementally
    const handleZonesChange = (event: Y.YMapEvent<any>) => {
      if (applyingRemoteUpdate) return;

      applyingRemoteUpdate = true;
      try {
        const currentZones = { ...useGameStore.getState().zones };
        let changed = false;

        event.changes.keys.forEach((change, key) => {
          if (change.action === "delete") {
            if (currentZones[key]) {
              delete currentZones[key];
              changed = true;
            }
          } else {
            const raw = zones.get(key);
            const sanitized = sanitizeZone(raw);
            if (sanitized) {
              // Filter cardIds to only include existing cards
              const storeCards = useGameStore.getState().cards;
              sanitized.cardIds = sanitized.cardIds.filter(
                (id) => storeCards[id] || cards.has(id)
              );
              currentZones[key] = sanitized;
              changed = true;
            }
          }
        });

        if (changed && Object.keys(currentZones).length <= MAX_ZONES) {
          useGameStore.setState({ zones: currentZones });
        }
      } finally {
        applyingRemoteUpdate = false;
      }
    };

    // Apply card changes incrementally
    const handleCardsChange = (event: Y.YMapEvent<any>) => {
      if (applyingRemoteUpdate) return;

      applyingRemoteUpdate = true;
      try {
        const currentCards = { ...useGameStore.getState().cards };
        const currentZones = useGameStore.getState().zones;
        let changed = false;

        event.changes.keys.forEach((change, key) => {
          if (change.action === "delete") {
            if (currentCards[key]) {
              delete currentCards[key];
              changed = true;
            }
          } else {
            const raw = cards.get(key);
            const sanitized = sanitizeCard(raw, currentZones);
            if (sanitized) {
              currentCards[key] = sanitized;
              changed = true;
            }
          }
        });

        if (changed && Object.keys(currentCards).length <= MAX_CARDS) {
          useGameStore.setState({ cards: currentCards });
        }
      } finally {
        applyingRemoteUpdate = false;
      }
    };

    // Apply global counter changes incrementally
    const handleGlobalCountersChange = (event: Y.YMapEvent<any>) => {
      if (applyingRemoteUpdate) return;

      applyingRemoteUpdate = true;
      try {
        const currentCounters = { ...useGameStore.getState().globalCounters };
        let changed = false;

        event.changes.keys.forEach((change, key) => {
          if (change.action === "delete") {
            if (currentCounters[key]) {
              delete currentCounters[key];
              changed = true;
            }
          } else {
            const value = globalCounters.get(key);
            if (typeof value === "string") {
              currentCounters[key.slice(0, 64)] = value.slice(0, 16);
              changed = true;
            }
          }
        });

        if (changed) {
          useGameStore.setState({ globalCounters: currentCounters });
        }
      } finally {
        applyingRemoteUpdate = false;
      }
    };

    // Full state reconstruction (for initial sync)
    const fullSyncToStore = () => {
      applyingRemoteUpdate = true;
      try {
        const safePlayers: Record<string, Player> = {};
        let playerCount = 0;
        players.forEach((value, key) => {
          if (playerCount >= MAX_PLAYERS) return;
          const p = sanitizePlayer(value);
          if (p) {
            safePlayers[key] = p;
            playerCount++;
          }
        });

        const safeZones: Record<string, Zone> = {};
        let zoneCount = 0;
        zones.forEach((value, key) => {
          if (zoneCount >= MAX_ZONES) return;
          const z = sanitizeZone(value);
          if (z) {
            safeZones[key] = z;
            zoneCount++;
          }
        });

        const safeCards: Record<string, Card> = {};
        let cardCount = 0;
        cards.forEach((value, key) => {
          if (cardCount >= MAX_CARDS) return;
          const c = sanitizeCard(value, safeZones);
          if (c) {
            safeCards[key] = c;
            cardCount++;
          }
        });

        // Filter zone cardIds to only reference existing cards
        Object.values(safeZones).forEach((zone) => {
          zone.cardIds = zone.cardIds.filter((id) => safeCards[id]);
        });

        const safeGlobalCounters: Record<string, string> = {};
        globalCounters.forEach((value, key) => {
          if (typeof key === "string" && typeof value === "string") {
            safeGlobalCounters[key.slice(0, 64)] = value.slice(0, 16);
          }
        });

        useGameStore.setState({
          players: safePlayers,
          zones: safeZones,
          cards: safeCards,
          globalCounters: safeGlobalCounters,
        });
      } finally {
        applyingRemoteUpdate = false;
      }
    };

    // Sync local store to Yjs (for recovery)
    const syncStoreToShared = () => {
      const state = useGameStore.getState();
      doc.transact(() => {
        // Sync players
        players.forEach((_, key) => {
          if (!state.players[key]) players.delete(key);
        });
        Object.entries(state.players).forEach(([key, value]) =>
          players.set(key, value)
        );
        // Sync zones
        zones.forEach((_, key) => {
          if (!state.zones[key]) zones.delete(key);
        });
        Object.entries(state.zones).forEach(([key, value]) =>
          zones.set(key, value)
        );
        // Sync cards
        cards.forEach((_, key) => {
          if (!state.cards[key]) cards.delete(key);
        });
        Object.entries(state.cards).forEach(([key, value]) =>
          cards.set(key, value)
        );
        // Sync global counters
        globalCounters.forEach((_, key) => {
          if (!state.globalCounters[key]) globalCounters.delete(key);
        });
        Object.entries(state.globalCounters).forEach(([key, value]) =>
          globalCounters.set(key, value)
        );
      });
    };

    // Register observers
    players.observe(handlePlayersChange);
    zones.observe(handleZonesChange);
    cards.observe(handleCardsChange);
    globalCounters.observe(handleGlobalCountersChange);

    // Awareness
    const pushLocalAwareness = () => {
      awareness.setLocalStateField("client", { id: ensuredPlayerId });
    };
    pushLocalAwareness();

    const handleAwareness = () => {
      setPeers(awareness.getStates().size || 1);
    };
    awareness.on("change", handleAwareness);
    handleAwareness();

    // Provider events
    provider.on("status", ({ status: s }: any) => {
      if (s === "connected") {
        setStatus("connected");
        flushPendingMutations();

        // If local has data but remote is empty, push local to shared
        const localCards = Object.keys(useGameStore.getState().cards).length;
        if (cards.size === 0 && localCards > 0) {
          syncStoreToShared();
        }

        pushLocalAwareness();
      }
      if (s === "disconnected") {
        setStatus("connecting");
      }
    });

    provider.on("sync", (isSynced: boolean) => {
      if (!isSynced) return;

      flushPendingMutations();

      // If local has data but remote is empty, push local to shared
      const localCards = Object.keys(useGameStore.getState().cards).length;
      if (cards.size === 0 && localCards > 0) {
        syncStoreToShared();
      }

      // Do a full sync to ensure consistency
      setTimeout(() => fullSyncToStore(), 50);
    });

    // Flush any pending mutations
    flushPendingMutations();

    // Cleanup function
    const cleanup = () => {
      awareness.setLocalState(null);
      try {
        removeAwarenessStates(awareness, [awareness.clientID], "disconnect");
      } catch (_err) {}

      awareness.off("change", handleAwareness);
      players.unobserve(handlePlayersChange);
      zones.unobserve(handleZonesChange);
      cards.unobserve(handleCardsChange);
      globalCounters.unobserve(handleGlobalCountersChange);

      bindSharedLogStore(null);
      setActiveSession(null);

      // Delayed disconnect to allow awareness to flush
      setTimeout(() => {
        provider.disconnect();
        provider.destroy();
        releaseSession(sessionId);
      }, 50);
    };

    cleanupRef.current = cleanup;

    return cleanup;
  }, [sessionId]);

  return { status, peers };
}
