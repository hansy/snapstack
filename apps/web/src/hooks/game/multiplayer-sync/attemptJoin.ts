import { useClientPrefsStore } from "@/store/clientPrefsStore";
import { ensureLocalPlayerInitialized } from "./ensureLocalPlayerInitialized";
import type { SharedMaps } from "@/yjs/yMutations";

export type JoinStateSetter = (
  blocked: boolean,
  reason: ReturnType<typeof ensureLocalPlayerInitialized>["reason"] | null,
) => void;

export function createAttemptJoin({
  docTransact,
  sharedMaps,
  playerId,
  setJoinState,
  getRole,
}: {
  docTransact: (fn: (tran: unknown) => void) => void;
  sharedMaps: SharedMaps;
  playerId: string;
  setJoinState: JoinStateSetter;
  getRole: () => string;
}) {
  return () => {
    if (getRole() === "spectator") {
      setJoinState(false, null);
      return;
    }
    const result = ensureLocalPlayerInitialized({
      transact: (fn) => docTransact(fn),
      sharedMaps,
      playerId,
      preferredUsername: useClientPrefsStore.getState().username,
    });
    const blocked = result?.status === "blocked";
    setJoinState(blocked, blocked ? result!.reason : null);
  };
}
