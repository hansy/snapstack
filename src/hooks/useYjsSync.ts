import { useEffect, useMemo, useRef, useState } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { Awareness, removeAwarenessStates } from 'y-protocols/awareness';
import { useGameStore } from '../store/gameStore';
import { bindSharedLogStore } from '../logging/logStore';
import { createGameYDoc } from '../yjs/yDoc';
import { setYDocHandles } from '../yjs/yManager';
import { removePlayer } from '../yjs/yMutations';
import { clampNormalizedPosition, migratePositionToNormalized } from '../lib/positions';

type SyncStatus = 'connecting' | 'connected';

const toPlain = <T,>(map: Y.Map<T>) => {
  const result: Record<string, T> = {};
  map.forEach((value, key) => {
    result[key] = value;
  });
  return result;
};

export function useYjsSync(sessionId: string) {
  const applyingRemote = useRef(false);
  const prevSession = useRef<string | null>(null);
  const joinedPlayerIdRef = useRef<string | null>(null);
  const [status, setStatus] = useState<SyncStatus>('connecting');
  const [peers, setPeers] = useState(1);

  // Build doc/maps once per hook instance
  const handles = useMemo(() => createGameYDoc(), []);

  const ENABLE_LOG_SYNC = true; // re-enabled now that drawer is stable

  useEffect(() => {
    if (!sessionId) return;
    if (typeof window === 'undefined') return;

    setStatus('connecting');
    setPeers(1);

    const currentSessionId = useGameStore.getState().sessionId;
    if (currentSessionId !== sessionId) {
      try {
        localStorage.removeItem('snapstack-storage');
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
    const room = `mtg-${sessionId}`;

    const signalingUrl = (() => {
      const envUrl = (import.meta as any).env?.VITE_SIGNAL_URL as string | undefined;
      if (envUrl) {
        const normalized = envUrl.replace(/^http/, 'ws').replace(/\/$/, '');
        return normalized.endsWith('/signal') ? normalized : `${normalized}/signal`;
      }
      if (typeof window === 'undefined') return 'ws://localhost:8787/signal';
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${proto}//${window.location.hostname}:8787/signal`;
    })();

    const provider = new WebsocketProvider(signalingUrl, room, doc, { awareness, connect: true });
    console.info('[signal] connecting websocket', { signaling: signalingUrl, room });

    const normalizeSharedCards = () => {
      const result: Record<string, any> = {};
      cards.forEach((value, key) => {
        if (!value?.position) {
          result[key] = value;
          return;
        }
        const needsMigration = value.position.x > 1 || value.position.y > 1;
        const nextPosition = needsMigration
          ? migratePositionToNormalized(value.position)
          : clampNormalizedPosition(value.position);
        const nextValue = { ...value, position: nextPosition };
        result[key] = nextValue;
        if (needsMigration || nextPosition.x !== value.position.x || nextPosition.y !== value.position.y) {
          cards.set(key, nextValue);
        }
      });
      return result;
    };

    const pushRemoteToStore = () => {
      applyingRemote.current = true;
      useGameStore.setState((current) => ({
        ...current,
        players: toPlain(players),
        zones: toPlain(zones),
        cards: normalizeSharedCards(),
        globalCounters: toPlain(globalCounters),
      }));
      applyingRemote.current = false;
    };

    const pushLocalAwareness = () => {
      const localId = useGameStore.getState().myPlayerId;
      joinedPlayerIdRef.current = localId;
      awareness.setLocalStateField('client', { id: localId });
    };

    const handleMapChange = () => pushRemoteToStore();

    // Advertise local presence (player id for now)
    pushLocalAwareness();

    players.observe(handleMapChange);
    zones.observe(handleMapChange);
    cards.observe(handleMapChange);
    globalCounters.observe(handleMapChange);

    provider.on('status', ({ status: s }: any) => {
      if (s === 'connected') {
        setStatus('connected');
        // Re-broadcast our awareness after connection to ensure peers see us immediately.
        pushLocalAwareness();
        setTimeout(() => pushLocalAwareness(), 10);
        pushRemoteToStore();
      }
      if (s === 'disconnected') setStatus('connecting');
    });

    const handleAwareness = () => {
      const size = awareness.getStates().size || 1;
      setPeers(size);
      console.info('[signal] awareness size', size);
    };

    awareness.on('change', handleAwareness);
    handleAwareness();

    return () => {
      // On leave, clear local awareness and remove this player's data so other peers
      // don't see a stale seat.
      const myId = joinedPlayerIdRef.current || useGameStore.getState().myPlayerId;
      awareness.setLocalState(null);
      try {
        // Best-effort broadcast of awareness removal before disconnecting so peers drop us immediately.
        const clientId = awareness.clientID;
        removeAwarenessStates(awareness, [clientId], 'disconnect');
      } catch (_err) {}

      doc.transact(() => {
        removePlayer({ players, zones, cards, globalCounters }, myId);
      });

      awareness.off('change', handleAwareness);
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
