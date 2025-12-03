import { useEffect, useMemo, useRef, useState } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { Awareness } from 'y-protocols/awareness';
import { useGameStore } from '../store/gameStore';
import { createGameYDoc } from '../yjs/yDoc';
import { setYDocHandles } from '../yjs/yManager';
import { removePlayer } from '../yjs/yMutations';

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

    const { doc, players, zones, cards, globalCounters } = handles;
    setYDocHandles(handles);
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

    const pushRemoteToStore = () => {
      applyingRemote.current = true;
      const ts = Date.now();
      console.info('[signal] pushRemoteToStore', {
        ts,
        players: players.size,
        zones: zones.size,
        cards: cards.size,
        globalCounters: globalCounters.size,
      });
      useGameStore.setState((current) => ({
        ...current,
        players: toPlain(players),
        zones: toPlain(zones),
        cards: toPlain(cards),
        globalCounters: toPlain(globalCounters),
      }));
      applyingRemote.current = false;
    };

    const handleMapChange = (evt?: any) => {
      const ts = Date.now();
      console.info('[signal] map change', {
        ts,
        players: players.size,
        zones: zones.size,
        cards: cards.size,
        globalCounters: globalCounters.size,
        origin: evt?.origin,
      });
      pushRemoteToStore();
    };

    // Advertise local presence (player id for now)
    const localId = useGameStore.getState().myPlayerId;
    joinedPlayerIdRef.current = localId;
    awareness.setLocalStateField('client', { id: localId });

    players.observe(handleMapChange);
    zones.observe(handleMapChange);
    cards.observe(handleMapChange);
    globalCounters.observe(handleMapChange);

    provider.on('status', ({ status: s }: any) => {
      console.info('[signal] status', s, 'ts', Date.now());
      if (s === 'connected') {
        setStatus('connected');
        pushRemoteToStore();
      }
      if (s === 'disconnected') setStatus('connecting');
    });

    provider.on('sync', (synced: boolean) => {
      console.info('[signal] sync', synced, 'ts', Date.now());
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
      doc.transact(() => {
        removePlayer({ players, zones, cards, globalCounters }, myId);
      });

      awareness.off('change', handleAwareness);
      players.unobserve(handleMapChange);
      zones.unobserve(handleMapChange);
      cards.unobserve(handleMapChange);
      globalCounters.unobserve(handleMapChange);
      setYDocHandles(null);
      provider.destroy();
      doc.destroy();
    };
  }, [handles, sessionId]);

  return { status, peers };
}
