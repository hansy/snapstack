import type { WebsocketProvider } from 'y-websocket';
import { YDocHandles } from './yDoc';
import type { SharedMaps } from './yMutations';

let currentHandles: YDocHandles | null = null;
let currentProvider: WebsocketProvider | null = null;
const pendingSharedMutations: Array<(maps: SharedMaps) => void> = [];

// Track if we're inside a batch transaction to avoid nested transactions
let batchDepth = 0;
let batchedMutations: Array<(maps: SharedMaps) => void> = [];

export const setYDocHandles = (handles: YDocHandles | null) => {
  currentHandles = handles;
};

export const getYDocHandles = () => currentHandles;

export const setYProvider = (provider: WebsocketProvider | null) => {
  currentProvider = provider;
};

export const getYProvider = () => currentProvider;

export const runWithSharedDoc = (fn: (maps: SharedMaps) => void) => {
  const handles = getYDocHandles();
  if (!handles) {
    if (typeof console !== "undefined") console.warn("[signal] queued shared mutation; handles not ready");
    pendingSharedMutations.push(fn);
    return true;
  }

  // If inside a batch, queue the mutation instead of executing immediately
  if (batchDepth > 0) {
    batchedMutations.push(fn);
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

/**
 * Batch multiple mutations into a single Yjs transaction.
 * This significantly reduces network traffic and prevents observer cascade.
 * 
 * @example
 * batchSharedMutations(() => {
 *   cards.forEach(card => addCard(card));
 *   shuffleLibrary(playerId);
 * });
 */
export const batchSharedMutations = (fn: () => void) => {
  const handles = getYDocHandles();
  if (!handles) {
    // If handles not ready, just run the function - mutations will queue individually
    fn();
    return;
  }

  batchDepth++;
  try {
    fn();
  } finally {
    batchDepth--;
  }

  // When we exit the outermost batch, execute all queued mutations in one transaction
  if (batchDepth === 0 && batchedMutations.length > 0) {
    const mutations = batchedMutations;
    batchedMutations = [];
    
    handles.doc.transact(() => {
      const maps: SharedMaps = {
        players: handles.players,
        zones: handles.zones,
        cards: handles.cards,
        globalCounters: handles.globalCounters,
      };
      mutations.forEach(mutation => mutation(maps));
    });
  }
};

export const flushPendingSharedMutations = () => {
  const handles = getYDocHandles();
  if (!handles) return;
  if (pendingSharedMutations.length === 0) return;
  if (typeof console !== "undefined") console.log("[signal] flushing queued mutations", pendingSharedMutations.length);
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
