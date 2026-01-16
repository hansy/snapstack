import type { GameState } from "@/types";

import { enforceZoneCounterRules } from "@/lib/counters";
import { normalizeCardForAdd } from "../cardsModel";
import type { Deps, GetState, SetState } from "./types";

export const createAddCard =
  (
    _set: SetState,
    get: GetState,
    { dispatchIntent }: Deps
  ): GameState["addCard"] =>
  (card, _isRemote) => {
    if (get().viewerRole === "spectator") return;
    const normalizedCard = normalizeCardForAdd(card);
    dispatchIntent({
      type: "card.add",
      payload: { card: normalizedCard },
      applyLocal: (state) => {
        const targetZone = state.zones[normalizedCard.zoneId];
        const cardWithCounters = {
          ...normalizedCard,
          counters: enforceZoneCounterRules(normalizedCard.counters, targetZone),
        };

        return {
          cards: { ...state.cards, [cardWithCounters.id]: cardWithCounters },
          zones: {
            ...state.zones,
            [cardWithCounters.zoneId]: {
              ...state.zones[cardWithCounters.zoneId],
              cardIds: [
                ...state.zones[cardWithCounters.zoneId].cardIds,
                cardWithCounters.id,
              ],
            },
          },
        };
      },
      isRemote: _isRemote,
    });
  };
