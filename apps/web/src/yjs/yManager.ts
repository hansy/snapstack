import type { WebsocketProvider } from 'y-websocket';
import { YDocHandles } from './yDoc';
import type { SharedMaps } from './yMutations';

let currentHandles: YDocHandles | null = null;
let currentProvider: WebsocketProvider | null = null;
const pendingSharedMutations: Array<(maps: SharedMaps) => void> = [];

export const setYDocHandles = (handles: YDocHandles | null) => {
  currentHandles = handles;
  flushPendingSharedMutations();
};

export const getYDocHandles = () => currentHandles;

export const setYProvider = (provider: WebsocketProvider | null) => {
  currentProvider = provider;
};

export const getYProvider = () => currentProvider;

export const runWithSharedDoc = (fn: (maps: SharedMaps) => void) => {
  const handles = getYDocHandles();
  if (!handles) {
    pendingSharedMutations.push(fn);
    return true;
  }

  handles.doc.transact(() => fn({
    players: handles.players,
    zones: handles.zones,
    cards: handles.cards,
    globalCounters: handles.globalCounters,
  }));
  return true;
};

export const flushPendingSharedMutations = () => {
  const handles = getYDocHandles();
  if (!handles) return;
  if (pendingSharedMutations.length === 0) return;
  const mutations = pendingSharedMutations.splice(0, pendingSharedMutations.length);
  handles.doc.transact(() => {
    mutations.forEach((fn) => fn({
      players: handles.players,
      zones: handles.zones,
      cards: handles.cards,
      globalCounters: handles.globalCounters,
    }));
  });
};
