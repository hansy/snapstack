import type { SharedMaps } from "@/yjs/yMutations";
import { sharedSnapshot } from "@/yjs/yMutations";
import { sanitizeSharedSnapshot, withApplyingRemoteUpdate } from "@/yjs/sync";

export const createFullSyncToStore = (
  sharedMaps: SharedMaps,
  setState: (next: ReturnType<typeof sanitizeSharedSnapshot>) => void
) => {
  return () => {
    withApplyingRemoteUpdate(() => {
      const snapshot = sharedSnapshot(sharedMaps);
      const safe = sanitizeSharedSnapshot(snapshot);
      setState(safe);
    });
  };
};

