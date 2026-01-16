import type { GameState } from "@/types";

import type { Deps, GetState, SetState } from "./types";

export const createUntapAll =
  (
    _set: SetState,
    get: GetState,
    { dispatchIntent }: Deps
  ): GameState["untapAll"] =>
  (playerId, _isRemote) => {
    if (get().viewerRole === "spectator") return;
    dispatchIntent({
      type: "card.untapAll",
      payload: { playerId, actorId: playerId },
      applyLocal: (state) => {
        const newCards = { ...state.cards };
        Object.values(newCards).forEach((card) => {
          if (card.controllerId === playerId && card.tapped) {
            newCards[card.id] = { ...card, tapped: false };
          }
        });
        return { cards: newCards };
      },
      isRemote: _isRemote,
    });
  };
