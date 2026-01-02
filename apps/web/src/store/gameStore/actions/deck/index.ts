import type { GameState } from "@/types";

import type { Deps, GetState, SetState } from "./types";
import { createDrawCard } from "./drawCard";
import { createDiscardFromLibrary } from "./discardFromLibrary";
import { createMulligan } from "./mulligan";
import { createResetDeck } from "./resetDeck";
import { createShuffleLibrary } from "./shuffleLibrary";
import { createUnloadDeck } from "./unloadDeck";

export const createDeckActions = (
  set: SetState,
  get: GetState,
  deps: Deps
): Pick<
  GameState,
  "drawCard" | "discardFromLibrary" | "shuffleLibrary" | "resetDeck" | "unloadDeck" | "mulligan"
> => ({
  drawCard: createDrawCard(set, get, deps),
  discardFromLibrary: createDiscardFromLibrary(set, get, deps),
  shuffleLibrary: createShuffleLibrary(set, get, deps),
  resetDeck: createResetDeck(set, get, deps),
  unloadDeck: createUnloadDeck(set, get, deps),
  mulligan: createMulligan(set, get, deps),
});
