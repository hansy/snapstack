import type { GameState } from "@/types";

import type { Deps, GetState, SetState } from "./types";

import { createAddCard } from "./addCard";
import { createDuplicateCard } from "./duplicateCard";
import { createRemoveCard } from "./removeCard";
import { createSetCardReveal } from "./setCardReveal";
import { createTapCard } from "./tapCard";
import { createTransformCard } from "./transformCard";
import { createUntapAll } from "./untapAll";
import { createUpdateCard } from "./updateCard";

export const createCardActions = (
  set: SetState,
  get: GetState,
  deps: Deps
): Pick<
  GameState,
  | "addCard"
  | "duplicateCard"
  | "updateCard"
  | "transformCard"
  | "removeCard"
  | "tapCard"
  | "untapAll"
  | "setCardReveal"
> => ({
  addCard: createAddCard(set, get, deps),
  duplicateCard: createDuplicateCard(set, get, deps),
  updateCard: createUpdateCard(set, get, deps),
  transformCard: createTransformCard(set, get, deps),
  removeCard: createRemoveCard(set, get, deps),
  tapCard: createTapCard(set, get, deps),
  untapAll: createUntapAll(set, get, deps),
  setCardReveal: createSetCardReveal(set, get, deps),
});
