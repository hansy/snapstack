import { useEffect, useMemo, useRef, useState } from "react";
import { WebsocketProvider } from "y-websocket";
import { Awareness, removeAwarenessStates } from "y-protocols/awareness";
import { useGameStore } from "../store/gameStore";
import { bindSharedLogStore } from "../logging/logStore";
import { createGameYDoc } from "../yjs/yDoc";
import { setYDocHandles } from "../yjs/yManager";
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

    const currentSessionId = useGameStore.getState().sessionId;
    if (currentSessionId !== sessionId) {
      try {
        localStorage.removeItem("snapstack-storage");
      } catch (_err) {}
      useGameStore.getState().resetSession(sessionId);
    }
    prevSession.current = sessionId;

    // Keep store in sync with the current session ID (local-only field).
    useGameStore.setState((state) => ({ ...state, sessionId }));

    const { doc, players, zones, cards, globalCounters, logs } = handles;
    setYDocHandles(handles);
    if (ENABLE_LOG_SYNC) bindSharedLogStore(logs);
    const awareness = new Awareness(doc);
    const room = sessionId;

    const signalingUrl = (() => {
      const envUrl = (import.meta as any).env?.VITE_SIGNAL_URL as
        | string
        | undefined;
      if (envUrl) {
        const normalized = envUrl.replace(/^http/, "ws").replace(/\/$/, "");
        return normalized.endsWith("/signal")
          ? normalized
          : `${normalized}/signal`;
      }
      if (typeof window === "undefined") return "ws://localhost:8787/signal";
      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      return `${proto}//${window.location.hostname}:8787/signal`;
    })();

    const provider = new WebsocketProvider(signalingUrl, room, doc, {
      awareness,
      connect: true,
    });
    console.info("[signal] connecting websocket", {
      signaling: signalingUrl,
      room,
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

    const pushRemoteToStore = () => {
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
      applyingRemote.current = true;
      useGameStore.setState((current) => ({
        ...current,
        players: safePlayers,
        zones: zonesWithExistingCards,
        cards: safeCards,
        globalCounters: safeGlobalCounters,
      }));
      applyingRemote.current = false;
    };

    const pushLocalAwareness = () => {
      const localId = useGameStore.getState().myPlayerId;
      awareness.setLocalStateField("client", { id: localId });
    };

    const handleMapChange = () => pushRemoteToStore();

    // Advertise local presence (player id for now)
    pushLocalAwareness();

    players.observe(handleMapChange);
    zones.observe(handleMapChange);
    cards.observe(handleMapChange);
    globalCounters.observe(handleMapChange);

    provider.on("status", ({ status: s }: any) => {
      if (s === "connected") {
        setStatus("connected");
        // Re-broadcast our awareness after connection to ensure peers see us immediately.
        pushLocalAwareness();
        setTimeout(() => pushLocalAwareness(), 10);
        pushRemoteToStore();
      }
      if (s === "disconnected") setStatus("connecting");
    });

    const handleAwareness = () => {
      const size = awareness.getStates().size || 1;
      setPeers(size);
      console.info("[signal] awareness size", size);
    };

    awareness.on("change", handleAwareness);
    handleAwareness();

    return () => {
      // On disconnect/unmount, drop presence and transport only. Seat data stays until an explicit leave action.
      awareness.setLocalState(null);
      try {
        // Best-effort broadcast of awareness removal before disconnecting so peers drop us immediately.
        const clientId = awareness.clientID;
        removeAwarenessStates(awareness, [clientId], "disconnect");
      } catch (_err) {}

      awareness.off("change", handleAwareness);
      players.unobserve(handleMapChange);
      zones.unobserve(handleMapChange);
      cards.unobserve(handleMapChange);
      globalCounters.unobserve(handleMapChange);
      if (ENABLE_LOG_SYNC) bindSharedLogStore(null);
      setYDocHandles(null);
      // Let awareness removal flush before tearing down the transport.
      setTimeout(() => {
        provider.disconnect();
        provider.destroy();
        doc.destroy();
      }, 25);
    };
  }, [handles, sessionId]);

  return { status, peers };
}
