/**
 * Module-level Y.Doc manager - decoupled from React lifecycle.
 *
 * This solves the React double-mount issue by keeping Y.Docs at module scope,
 * keyed by sessionId. The docs survive React's StrictMode unmount/remount cycle.
 */

import type { YSyncProvider } from "./provider";

import type { YDocHandles } from "./yDoc";

import {
  getActiveHandles,
  getActiveSessionId,
  getSessionProvider,
  setSessionProvider,
} from "./docManager/sessionStore";

export {
  acquireSession,
  cleanupStaleSessions,
  destroySession,
  destroyAllSessions,
  getActiveHandles,
  getActiveSessionId,
  getSessionAwareness,
  getSessionHandles,
  getSessionProvider,
  releaseSession,
  setActiveSession,
  setSessionAwareness,
  setSessionProvider,
} from "./docManager/sessionStore";


// Compatibility exports for existing code
export const getYDocHandles = getActiveHandles;
export const setYDocHandles = (_handles: YDocHandles | null) => {
  // Legacy - now handled by acquireSession/setActiveSession
};
export const getYProvider = () => {
  const sessionId = getActiveSessionId();
  return sessionId ? getSessionProvider(sessionId) : null;
};
export const setYProvider = (provider: YSyncProvider | null) => {
  const sessionId = getActiveSessionId();
  if (sessionId) setSessionProvider(sessionId, provider);
};
