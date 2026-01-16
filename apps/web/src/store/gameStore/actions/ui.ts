import type { StoreApi } from "zustand";

import type { GameState } from "@/types";
import type { DispatchIntent } from "@/store/gameStore/dispatchIntent";


type SetState = StoreApi<GameState>["setState"];
type GetState = StoreApi<GameState>["getState"];

type Deps = {
  dispatchIntent: DispatchIntent;
};

export const createUiActions = (
  set: SetState,
  get: GetState,
  { dispatchIntent }: Deps
): Pick<GameState, "setActiveModal" | "setBattlefieldViewScale"> => ({
  setActiveModal: (modal) => {
    set({ activeModal: modal });
  },

  setBattlefieldViewScale: (playerId, scale) => {
    const clamped = Math.min(Math.max(scale, 0.5), 1);
    const current = get().battlefieldViewScale[playerId];
    if (current === clamped) return;

    dispatchIntent({
      type: "ui.battlefieldScale.set",
      payload: { playerId, scale: clamped },
      applyLocal: (state) => ({
        battlefieldViewScale: {
          ...state.battlefieldViewScale,
          [playerId]: clamped,
        },
      }),
    });
  },
});
