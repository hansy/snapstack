import type { StoreApi } from "zustand";
import type { GameState } from "@/types";
import type { SharedMaps } from "@/yjs/yMutations";
import { sharedSnapshot } from "@/yjs/yMutations";
import { sanitizeSharedSnapshot, withApplyingRemoteUpdate } from "@/yjs/sync";
import { applyPendingIntents, setAuthoritativeState } from "@/store/gameStore/dispatchIntent";
import { mergePrivateOverlay } from "@/store/gameStore/overlay";

export const createFullSyncToStore = (
  sharedMaps: SharedMaps,
  setState: StoreApi<GameState>["setState"]
) => {
  return () => {
    withApplyingRemoteUpdate(() => {
      const snapshot = sharedSnapshot(sharedMaps);
      const safe = sanitizeSharedSnapshot(snapshot);
      setState((current) => {
        const basePublic = { ...current, ...safe };
        const merged = mergePrivateOverlay(basePublic, basePublic.privateOverlay);
        setAuthoritativeState(merged, basePublic);
        const reconciled = applyPendingIntents(merged);
        return reconciled;
      });
    });
  };
};
