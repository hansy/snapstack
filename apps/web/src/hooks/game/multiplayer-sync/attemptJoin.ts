import { useClientPrefsStore } from "@/store/clientPrefsStore";
import { useCommandLog } from "@/lib/featureFlags";
import type { CommandEnvelope } from "@/commandLog/types";
import type * as Y from "yjs";
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
  sessionId,
  commands,
}: {
  docTransact: (fn: (tran: unknown) => void) => void;
  sharedMaps: SharedMaps;
  playerId: string;
  setJoinState: JoinStateSetter;
  getRole: () => string;
  sessionId?: string;
  commands?: Y.Array<CommandEnvelope>;
}) {
  return () => {
    if (getRole() === "spectator") {
      setJoinState(false, null);
      return;
    }
    const commandLog =
      useCommandLog && sessionId && commands
        ? { sessionId, commands }
        : undefined;
    const result = ensureLocalPlayerInitialized({
      transact: (fn) => docTransact(fn),
      sharedMaps,
      playerId,
      preferredUsername: useClientPrefsStore.getState().username,
      commandLog,
    });
    const blocked = result?.status === "blocked";
    setJoinState(blocked, blocked ? result!.reason : null);
  };
}
