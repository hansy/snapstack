import type { Awareness } from "y-protocols/awareness";
import type { YSyncProvider } from "../provider";

import { createGameYDoc, type YDocHandles } from "../yDoc";
import { docManagerState } from "./state";

/**
 * Get or create a Y.Doc for a session.
 * Ref-counted - call releaseSession when done.
 */
export function acquireSession(sessionId: string): YDocHandles {
  let session = docManagerState.sessions.get(sessionId);

  if (!session) {
    const handles = createGameYDoc();

    session = {
      handles,
      provider: null,
      awareness: null,
      refCount: 0,
      lastAccess: Date.now(),
    };
    docManagerState.sessions.set(sessionId, session);
  }

  session.refCount += 1;
  session.lastAccess = Date.now();
  docManagerState.activeSessionId = sessionId;

  return session.handles;
}

/**
 * Release a session reference. When refCount hits 0, schedule cleanup.
 */
export function releaseSession(sessionId: string): void {
  const session = docManagerState.sessions.get(sessionId);
  if (!session) return;

  session.refCount = Math.max(0, session.refCount - 1);

  if (session.refCount === 0) {
    // Disconnect network transports when no active consumers remain.
    try {
      session.provider?.disconnect();
      session.provider?.destroy();
    } catch (_err) {}
    session.provider = null;
    session.awareness = null;
  }

  // Don't immediately destroy - allow for React double-mount.
  // The session will be cleaned up by cleanupStaleSessions if truly unused.
}

/**
 * Set the WebSocket provider for a session.
 */
export function setSessionProvider(
  sessionId: string,
  provider: YSyncProvider | null
): void {
  const session = docManagerState.sessions.get(sessionId);
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
export function getSessionProvider(sessionId: string): YSyncProvider | null {
  return docManagerState.sessions.get(sessionId)?.provider ?? null;
}

/**
 * Set the Awareness instance for a session.
 */
export function setSessionAwareness(sessionId: string, awareness: Awareness | null): void {
  const session = docManagerState.sessions.get(sessionId);
  if (session) {
    session.awareness = awareness;
  }
}

/**
 * Get the Awareness instance for a session.
 */
export function getSessionAwareness(sessionId: string): Awareness | null {
  return docManagerState.sessions.get(sessionId)?.awareness ?? null;
}

/**
 * Get handles for the active session (for mutations).
 */
export function getActiveHandles(): YDocHandles | null {
  if (!docManagerState.activeSessionId) return null;
  return docManagerState.sessions.get(docManagerState.activeSessionId)?.handles ?? null;
}

/**
 * Get handles for a specific session.
 */
export function getSessionHandles(sessionId: string): YDocHandles | null {
  return docManagerState.sessions.get(sessionId)?.handles ?? null;
}

/**
 * Set which session is currently active.
 */
export function setActiveSession(sessionId: string | null): void {
  docManagerState.activeSessionId = sessionId;
}

/**
 * Get the active session ID.
 */
export function getActiveSessionId(): string | null {
  return docManagerState.activeSessionId;
}

/**
 * Destroy a session completely.
 */
export function destroySession(sessionId: string): void {
  const session = docManagerState.sessions.get(sessionId);
  if (!session) return;

  try {
    session.provider?.disconnect();
    session.provider?.destroy();
  } catch (_err) {}

  try {
    session.handles.doc.destroy();
  } catch (_err) {}

  docManagerState.sessions.delete(sessionId);

  if (docManagerState.activeSessionId === sessionId) {
    docManagerState.activeSessionId = null;
  }
}

/**
 * Clean up sessions that haven't been accessed in a while.
 * Call this periodically or on navigation.
 */
export function cleanupStaleSessions(maxAgeMs: number = 5 * 60 * 1000): void {
  const now = Date.now();

  for (const [sessionId, session] of docManagerState.sessions) {
    if (session.refCount === 0 && now - session.lastAccess > maxAgeMs) {
      destroySession(sessionId);
    }
  }
}

export function destroyAllSessions(): void {
  const sessionIds = Array.from(docManagerState.sessions.keys());
  sessionIds.forEach((sessionId) => {
    destroySession(sessionId);
  });
}
