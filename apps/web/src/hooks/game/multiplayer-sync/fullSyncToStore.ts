import type { StoreApi } from "zustand";
import type { GameState } from "@/types";
import type { SharedMaps } from "@/yjs/yMutations";
import { sharedSnapshot } from "@/yjs/yMutations";
import { sanitizeSharedSnapshot, withApplyingRemoteUpdate } from "@/yjs/sync";
import { applyPendingIntents, setAuthoritativeState } from "@/store/gameStore/dispatchIntent";
import { mergePrivateOverlay } from "@/store/gameStore/overlay";

let warnedInvalidPlayers = false;
let warnedDroppedPlayers = false;

const shouldLogInvalidPlayers = () => {
  const maybeProcess = (globalThis as { process?: unknown }).process;
  const maybeEnv =
    maybeProcess && typeof maybeProcess === "object"
      ? (maybeProcess as { env?: Record<string, unknown> }).env
      : undefined;
  const isTestEnv =
    import.meta.env.MODE === "test" || Boolean(maybeEnv?.VITEST);
  return !isTestEnv;
};

const getInvalidPlayers = (players: Record<string, GameState["players"][string] | undefined>) =>
  Object.entries(players).filter(
    ([, value]) => !value || typeof value.id !== "string"
  );

export const createFullSyncToStore = (
  sharedMaps: SharedMaps,
  setState: StoreApi<GameState>["setState"]
) => {
  return () => {
    withApplyingRemoteUpdate(() => {
      const snapshot = sharedSnapshot(sharedMaps);
      const safe = sanitizeSharedSnapshot(snapshot);
      if (shouldLogInvalidPlayers() && !warnedDroppedPlayers) {
        const dropped = Object.keys(snapshot.players).filter((id) => !safe.players[id]);
        if (dropped.length > 0) {
          warnedDroppedPlayers = true;
          console.warn("[sync] dropped invalid players during sanitize", {
            dropped,
            snapshotPlayerIds: Object.keys(snapshot.players),
          });
        }
      }
      setState((current) => {
        const basePublic = { ...current, ...safe };
        const merged = mergePrivateOverlay(basePublic, basePublic.privateOverlay);
        setAuthoritativeState(merged, basePublic);
        const reconciled = applyPendingIntents(merged);
        if (shouldLogInvalidPlayers() && !warnedInvalidPlayers) {
          const invalid = getInvalidPlayers(reconciled.players);
          if (invalid.length > 0) {
            warnedInvalidPlayers = true;
            console.warn("[sync] invalid players detected after reconcile", {
              sessionId: current.sessionId,
              invalidKeys: invalid.map(([key]) => key),
              invalidEntries: invalid,
            });
          }
        }
        return reconciled;
      });
    });
  };
};
