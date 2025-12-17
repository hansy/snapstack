/**
 * Module-level Y.Doc manager - decoupled from React lifecycle.
 * 
 * This solves the React double-mount issue by keeping Y.Docs at module scope,
 * keyed by sessionId. The docs survive React's StrictMode unmount/remount cycle.
 */

import { WebsocketProvider } from 'y-websocket';
import { Awareness } from 'y-protocols/awareness';
import { createGameYDoc, type YDocHandles } from './yDoc';
import type { SharedMaps } from './yMutations';

interface SessionState {
  handles: YDocHandles;
  provider: WebsocketProvider | null;
  awareness: Awareness | null;
  refCount: number;
  lastAccess: number;
}

// Module-level state - survives React lifecycle
const sessions = new Map<string, SessionState>();
const pendingMutations = new Map<string, Array<(maps: SharedMaps) => void>>();
const DEFAULT_SESSION_KEY = '__default__';

// Currently active session
let activeSessionId: string | null = null;

// Batch transaction tracking
let batchDepth = 0;
let batchedMutations: Array<(maps: SharedMaps) => void> = [];

/**
 * Get or create a Y.Doc for a session. 
 * Ref-counted - call releaseSession when done.
 */
export function acquireSession(sessionId: string): YDocHandles {
  let session = sessions.get(sessionId);
  
  if (!session) {
    const handles = createGameYDoc();
    
    session = {
      handles,
      provider: null,
      awareness: null,
      refCount: 0,
      lastAccess: Date.now(),
    };
    sessions.set(sessionId, session);
  }
  
  session.refCount++;
  session.lastAccess = Date.now();
  activeSessionId = sessionId;
  
  return session.handles;
}

/**
 * Release a session reference. When refCount hits 0, schedule cleanup.
 */
export function releaseSession(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (!session) return;
  
  session.refCount = Math.max(0, session.refCount - 1);
  
  // Don't immediately destroy - allow for React double-mount
  // The session will be cleaned up by cleanupStaleSessions if truly unused
}

/**
 * Set the WebSocket provider for a session.
 */
export function setSessionProvider(sessionId: string, provider: WebsocketProvider | null): void {
  const session = sessions.get(sessionId);
  if (!session) return;
  
  // Disconnect old provider if replacing
  if (session.provider && session.provider !== provider) {
    try {
      session.provider.disconnect();
      session.provider.destroy();
    } catch (_err) {}
  }
  
  session.provider = provider;
}

/**
 * Get the WebSocket provider for a session.
 */
export function getSessionProvider(sessionId: string): WebsocketProvider | null {
  return sessions.get(sessionId)?.provider ?? null;
}

/**
 * Set the Awareness instance for a session.
 */
export function setSessionAwareness(sessionId: string, awareness: Awareness | null): void {
  const session = sessions.get(sessionId);
  if (session) {
    session.awareness = awareness;
  }
}

/**
 * Get the Awareness instance for a session.
 */
export function getSessionAwareness(sessionId: string): Awareness | null {
  return sessions.get(sessionId)?.awareness ?? null;
}

/**
 * Get handles for the active session (for mutations).
 */
export function getActiveHandles(): YDocHandles | null {
  if (!activeSessionId) return null;
  return sessions.get(activeSessionId)?.handles ?? null;
}

/**
 * Get handles for a specific session.
 */
export function getSessionHandles(sessionId: string): YDocHandles | null {
  return sessions.get(sessionId)?.handles ?? null;
}

/**
 * Set which session is currently active.
 */
export function setActiveSession(sessionId: string | null): void {
  activeSessionId = sessionId;
}

/**
 * Get the active session ID.
 */
export function getActiveSessionId(): string | null {
  return activeSessionId;
}

/**
 * Destroy a session completely.
 */
export function destroySession(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (!session) return;
  
  try {
    session.provider?.disconnect();
    session.provider?.destroy();
  } catch (_err) {}
  
  try {
    session.handles.doc.destroy();
  } catch (_err) {}
  
  sessions.delete(sessionId);
  pendingMutations.delete(sessionId);
  
  if (activeSessionId === sessionId) {
    activeSessionId = null;
  }
}

/**
 * Clean up sessions that haven't been accessed in a while.
 * Call this periodically or on navigation.
 */
export function cleanupStaleSessions(maxAgeMs: number = 5 * 60 * 1000): void {
  const now = Date.now();
  
  for (const [sessionId, session] of sessions) {
    if (session.refCount === 0 && now - session.lastAccess > maxAgeMs) {
      destroySession(sessionId);
    }
  }
}

/**
 * Run a mutation on the active session's Y.Doc.
 */
export function runMutation(fn: (maps: SharedMaps) => void): boolean {
  const handles = getActiveHandles();
  
  if (!handles || !activeSessionId) {
    const key = activeSessionId ?? DEFAULT_SESSION_KEY;
    const queue = pendingMutations.get(key) ?? [];
    queue.push(fn);
    pendingMutations.set(key, queue);
    return false;
  }
  
  // If inside a batch, queue instead of executing
  if (batchDepth > 0) {
    batchedMutations.push(fn);
    return true;
  }
  
  handles.doc.transact(() => fn({
    players: handles.players,
    playerOrder: handles.playerOrder,
    zones: handles.zones,
    cards: handles.cards,
    zoneCardOrders: handles.zoneCardOrders,
    globalCounters: handles.globalCounters,
    battlefieldViewScale: handles.battlefieldViewScale,
  }));
  
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
  
  batchDepth++;
  try {
    fn();
  } finally {
    batchDepth--;
  }
  
  // Execute all queued mutations when exiting outermost batch
  if (batchDepth === 0 && batchedMutations.length > 0) {
    const mutations = batchedMutations;
    batchedMutations = [];
    
    handles.doc.transact(() => {
      const maps: SharedMaps = {
        players: handles.players,
        playerOrder: handles.playerOrder,
        zones: handles.zones,
        cards: handles.cards,
        zoneCardOrders: handles.zoneCardOrders,
        globalCounters: handles.globalCounters,
        battlefieldViewScale: handles.battlefieldViewScale,
      };
      mutations.forEach(m => m(maps));
    });
  }
}

/**
 * Flush pending mutations (call after provider connects).
 */
export function flushPendingMutations(): void {
  const handles = getActiveHandles();
  if (!handles || !activeSessionId) return;
  const sessionQueue = pendingMutations.get(activeSessionId) ?? [];
  const defaultQueue = pendingMutations.get(DEFAULT_SESSION_KEY) ?? [];
  const mutations = [...defaultQueue, ...sessionQueue];
  if (mutations.length === 0) return;
  
  pendingMutations.set(DEFAULT_SESSION_KEY, []);
  pendingMutations.set(activeSessionId, []);
  
  handles.doc.transact(() => {
    const maps: SharedMaps = {
      players: handles.players,
      playerOrder: handles.playerOrder,
      zones: handles.zones,
      cards: handles.cards,
      zoneCardOrders: handles.zoneCardOrders,
      globalCounters: handles.globalCounters,
      battlefieldViewScale: handles.battlefieldViewScale,
    };
    mutations.forEach(fn => fn(maps));
  });
}

// Compatibility exports for existing code
export const getYDocHandles = getActiveHandles;
export const setYDocHandles = (_handles: YDocHandles | null) => {
  // Legacy - now handled by acquireSession/setActiveSession
};
export const getYProvider = () => activeSessionId ? getSessionProvider(activeSessionId) : null;
export const setYProvider = (provider: WebsocketProvider | null) => {
  if (activeSessionId) setSessionProvider(activeSessionId, provider);
};
export const runWithSharedDoc = runMutation;
export const batchSharedMutations = batchMutations;
export const flushPendingSharedMutations = flushPendingMutations;
