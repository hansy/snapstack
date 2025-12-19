import type { GameState } from "@/types";

import type { Deps, GetState, SetState } from "./types";
import { createDrawCard } from "./drawCard";
import { createResetDeck } from "./resetDeck";
import { createShuffleLibrary } from "./shuffleLibrary";
import { createUnloadDeck } from "./unloadDeck";

export const createDeckActions = (
  set: SetState,
  get: GetState,
  deps: Deps
): Pick<GameState, "drawCard" | "shuffleLibrary" | "resetDeck" | "unloadDeck"> => ({
  drawCard: createDrawCard(set, get, deps),
  shuffleLibrary: createShuffleLibrary(set, get, deps),
  resetDeck: createResetDeck(set, get, deps),
  unloadDeck: createUnloadDeck(set, get, deps),
});
