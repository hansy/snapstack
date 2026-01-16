import { useClientPrefsStore } from "@/store/clientPrefsStore";
import { useGameStore } from "@/store/gameStore";
import { ensureLocalPlayerInitialized } from "./ensureLocalPlayerInitialized";

export type JoinStateSetter = (
  blocked: boolean,
  reason: NonNullable<ReturnType<typeof ensureLocalPlayerInitialized>>["reason"] | null,
) => void;

export function createAttemptJoin({
  playerId,
  setJoinState,
  getRole,
}: {
  playerId: string;
  setJoinState: JoinStateSetter;
  getRole: () => string;
}) {
  return () => {
    if (getRole() === "spectator") {
      setJoinState(false, null);
      return;
    }
    const store = useGameStore.getState();
    const result = ensureLocalPlayerInitialized({
      state: {
        players: store.players,
        playerOrder: store.playerOrder,
        zones: store.zones,
        roomLockedByHost: store.roomLockedByHost,
        roomOverCapacity: store.roomOverCapacity,
      },
      actions: {
        addPlayer: store.addPlayer,
        updatePlayer: store.updatePlayer,
        addZone: store.addZone,
      },
      playerId,
      preferredUsername: useClientPrefsStore.getState().username,
    });
    const blocked = result?.status === "blocked";
    setJoinState(blocked, blocked ? result!.reason : null);
  };
}
