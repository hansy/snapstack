import type { StoreApi } from "zustand";

import type { GameState } from "@/types";
import type { DispatchIntent } from "@/store/gameStore/dispatchIntent";

export type SetState = StoreApi<GameState>["setState"];
export type GetState = StoreApi<GameState>["getState"];

export type Deps = {
  dispatchIntent: DispatchIntent;
};
