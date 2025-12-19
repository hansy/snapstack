import type { GameState } from "@/types";

import { emitLog } from "@/logging/logStore";
import { patchCard as yPatchCard, sharedSnapshot } from "@/yjs/yMutations";
import type { Deps, GetState, SetState } from "./types";

export const createUntapAll =
  (
    set: SetState,
    _get: GetState,
    { applyShared, buildLogContext }: Deps
  ): GameState["untapAll"] =>
  (playerId, _isRemote) => {
    if (
      applyShared((maps) => {
        const snapshot = sharedSnapshot(maps);
        Object.values(snapshot.cards).forEach((card) => {
          if (card.controllerId === playerId && card.tapped) {
            yPatchCard(maps, card.id, { tapped: false });
          }
        });
      })
    )
      return;

    set((state) => {
      const newCards = { ...state.cards };
      Object.values(newCards).forEach((card) => {
        if (card.controllerId === playerId && card.tapped) {
          newCards[card.id] = { ...card, tapped: false };
        }
      });
      return { cards: newCards };
    });
    emitLog("card.untapAll", { actorId: playerId, playerId }, buildLogContext());
  };

