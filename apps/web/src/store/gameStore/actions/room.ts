import type { StoreApi } from "zustand";

import type { GameState } from "@/types";
import type { SharedMaps } from "@/yjs/yMutations";
import { patchRoomMeta } from "@/yjs/yMutations";
import { MAX_ROOM_PLAYERS } from "@/lib/room";

type SetState = StoreApi<GameState>["setState"];
type GetState = StoreApi<GameState>["getState"];

type ApplyShared = (fn: (maps: SharedMaps) => void) => boolean;

type Deps = {
  applyShared: ApplyShared;
};

export const createRoomActions = (
  set: SetState,
  get: GetState,
  { applyShared }: Deps
): Pick<GameState, "setRoomLockedByHost"> => ({
  setRoomLockedByHost: (locked) => {
    const state = get();
    if (!state.roomHostId || state.roomHostId !== state.myPlayerId) return;

    const playerCount = Object.keys(state.players).length;
    const isFull = playerCount >= MAX_ROOM_PLAYERS;
    if (!locked && isFull) return;

    if (
      applyShared((maps) => {
        patchRoomMeta(maps, { locked });
      })
    )
      return;

    set({ roomLockedByHost: locked });
  },
});
