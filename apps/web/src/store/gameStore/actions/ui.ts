import type { StoreApi } from "zustand";

import type { BattlefieldGridSizing, GameState } from "@/types";
import type { DispatchIntent } from "@/store/gameStore/dispatchIntent";


type SetState = StoreApi<GameState>["setState"];
type GetState = StoreApi<GameState>["getState"];

type Deps = {
  dispatchIntent: DispatchIntent;
};

const areSizingEqual = (a: BattlefieldGridSizing | undefined, b: BattlefieldGridSizing) =>
  Boolean(
    a &&
      a.zoneHeightPx === b.zoneHeightPx &&
      a.baseCardHeightPx === b.baseCardHeightPx &&
      a.baseCardWidthPx === b.baseCardWidthPx &&
      a.viewScale === b.viewScale
  );

export const createUiActions = (
  set: SetState,
  get: GetState,
  { dispatchIntent }: Deps
): Pick<GameState, "setActiveModal" | "setBattlefieldViewScale" | "setBattlefieldGridSizing"> => ({
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

  setBattlefieldGridSizing: (playerId, sizing) => {
    set((state) => {
      if (!sizing) {
        if (!state.battlefieldGridSizing[playerId]) return {};
        const next = { ...state.battlefieldGridSizing };
        Reflect.deleteProperty(next, playerId);
        return { battlefieldGridSizing: next };
      }
      if (areSizingEqual(state.battlefieldGridSizing[playerId], sizing)) {
        return {};
      }
      return {
        battlefieldGridSizing: {
          ...state.battlefieldGridSizing,
          [playerId]: sizing,
        },
      };
    });
  },
});
