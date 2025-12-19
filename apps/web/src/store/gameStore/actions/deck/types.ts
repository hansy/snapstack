import type { StoreApi } from "zustand";

import type { GameState } from "@/types";
import type { LogContext } from "@/logging/types";
import type { SharedMaps } from "@/yjs/yMutations";

export type SetState = StoreApi<GameState>["setState"];
export type GetState = StoreApi<GameState>["getState"];

export type ApplyShared = (fn: (maps: SharedMaps) => void) => boolean;

export type Deps = {
  applyShared: ApplyShared;
  buildLogContext: () => LogContext;
};

