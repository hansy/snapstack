import type { StoreApi } from "zustand";

import type { GameState } from "@/types";
import type { DispatchIntent } from "@/store/gameStore/dispatchIntent";
import { MAX_PLAYERS } from "@/lib/room";

type SetState = StoreApi<GameState>["setState"];
type GetState = StoreApi<GameState>["getState"];

type Deps = {
  dispatchIntent: DispatchIntent;
};

export const createRoomActions = (
  _set: SetState,
  get: GetState,
  { dispatchIntent }: Deps
): Pick<GameState, "setRoomLockedByHost"> => ({
  setRoomLockedByHost: (locked) => {
    const state = get();
    if (state.viewerRole === "spectator") return;
    if (!state.roomHostId || state.roomHostId !== state.myPlayerId) return;

    const playerCount = Object.keys(state.players).length;
    const isFull = playerCount >= MAX_PLAYERS;
    if (!locked && isFull) return;

    dispatchIntent({
      type: "room.lock",
      payload: { locked, actorId: state.myPlayerId },
      applyLocal: () => ({ roomLockedByHost: locked }),
    });
  },
});
