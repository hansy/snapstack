import type { SharedMaps } from "../yMutations";
import type { YDocHandles } from "../yDoc";

import { docManagerState, DEFAULT_SESSION_KEY } from "./state";
import { getActiveHandles, getActiveSessionId } from "./sessionStore";

const buildSharedMaps = (handles: YDocHandles): SharedMaps => ({
  players: handles.players,
  playerOrder: handles.playerOrder,
  zones: handles.zones,
  cards: handles.cards,
  zoneCardOrders: handles.zoneCardOrders,
  globalCounters: handles.globalCounters,
  battlefieldViewScale: handles.battlefieldViewScale,
  meta: handles.meta,
});

/**
 * Run a mutation on the active session's Y.Doc.
 */
export function runMutation(fn: (maps: SharedMaps) => void): boolean {
  const handles = getActiveHandles();
  const activeSessionId = getActiveSessionId();

  if (!handles || !activeSessionId) {
    const key = activeSessionId ?? DEFAULT_SESSION_KEY;
    const queue = docManagerState.pendingMutations.get(key) ?? [];
    queue.push(fn);
    docManagerState.pendingMutations.set(key, queue);
    return false;
  }

  // If inside a batch, queue instead of executing
  if (docManagerState.batchDepth > 0) {
    docManagerState.batchedMutations.push(fn);
    return true;
  }

  handles.doc.transact(() => fn(buildSharedMaps(handles)));
  return true;
}

/**
 * Batch multiple mutations into a single Y.Doc transaction.
 */
export function batchMutations(fn: () => void): void {
  const handles = getActiveHandles();

  if (!handles) {
    fn();
    return;
  }

  docManagerState.batchDepth += 1;
  try {
    fn();
  } finally {
    docManagerState.batchDepth -= 1;
  }

  // Execute all queued mutations when exiting outermost batch
  if (docManagerState.batchDepth === 0 && docManagerState.batchedMutations.length > 0) {
    const mutations = docManagerState.batchedMutations;
    docManagerState.batchedMutations = [];

    handles.doc.transact(() => {
      const maps = buildSharedMaps(handles);
      mutations.forEach((mutation) => mutation(maps));
    });
  }
}

/**
 * Flush pending mutations (call after provider connects).
 */
export function flushPendingMutations(): void {
  const handles = getActiveHandles();
  const activeSessionId = getActiveSessionId();
  if (!handles || !activeSessionId) return;

  const sessionQueue = docManagerState.pendingMutations.get(activeSessionId) ?? [];
  const defaultQueue = docManagerState.pendingMutations.get(DEFAULT_SESSION_KEY) ?? [];
  const mutations = [...defaultQueue, ...sessionQueue];
  if (mutations.length === 0) return;

  docManagerState.pendingMutations.set(DEFAULT_SESSION_KEY, []);
  docManagerState.pendingMutations.set(activeSessionId, []);

  handles.doc.transact(() => {
    const maps = buildSharedMaps(handles);
    mutations.forEach((mutation) => mutation(maps));
  });
}
