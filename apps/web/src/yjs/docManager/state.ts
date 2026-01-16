import type { Awareness } from "y-protocols/awareness";
import type { YSyncProvider } from "../provider";

import type { YDocHandles } from "../yDoc";

export interface SessionState {
  handles: YDocHandles;
  provider: YSyncProvider | null;
  awareness: Awareness | null;
  refCount: number;
  lastAccess: number;
}

export const docManagerState = {
  sessions: new Map<string, SessionState>(),
  activeSessionId: null as string | null,
};
