import type { StoreApi } from "zustand";

import type { GameState } from "@/types";
import type { SharedMaps } from "@/yjs/yMutations";

import { setBattlefieldViewScale as ySetBattlefieldViewScale } from "@/yjs/yMutations";

type SetState = StoreApi<GameState>["setState"];
type GetState = StoreApi<GameState>["getState"];

type ApplyShared = (fn: (maps: SharedMaps) => void) => boolean;

type Deps = {
  applyShared: ApplyShared;
};

export const createUiActions = (
  set: SetState,
  get: GetState,
  { applyShared }: Deps
): Pick<GameState, "setActiveModal" | "setBattlefieldViewScale"> => ({
  setActiveModal: (modal) => {
    set({ activeModal: modal });
  },

  setBattlefieldViewScale: (playerId, scale) => {
    const clamped = Math.min(Math.max(scale, 0.5), 1);
    const current = get().battlefieldViewScale[playerId];
    if (current === clamped) return;

    // Apply to Yjs for multiplayer sync, but also update local store immediately.
    // The shared-doc -> store sync is debounced; without an optimistic local update,
    // continuous changes (like drag-to-zoom) can appear unresponsive.
    applyShared((maps) => ySetBattlefieldViewScale(maps, playerId, clamped));

    set((state) => ({
      battlefieldViewScale: {
        ...state.battlefieldViewScale,
        [playerId]: clamped,
      },
    }));
  },
});

