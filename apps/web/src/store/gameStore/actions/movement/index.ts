import type { GameState } from "@/types";

import type { Deps, GetState, SetState } from "./types";
import { createMoveCard } from "./moveCard";
import { createMoveCardToBottom } from "./moveCardToBottom";

export const createMovementActions = (
  set: SetState,
  get: GetState,
  deps: Deps
): Pick<GameState, "moveCard" | "moveCardToBottom"> => ({
  moveCard: createMoveCard(set, get, deps),
  moveCardToBottom: createMoveCardToBottom(set, get, deps),
});
