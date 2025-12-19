import type { GameState } from "@/types";

import { enforceZoneCounterRules } from "@/lib/counters";
import { upsertCard as yUpsertCard } from "@/yjs/yMutations";
import { normalizeCardForAdd } from "../cardsModel";
import type { Deps, GetState, SetState } from "./types";

export const createAddCard =
  (set: SetState, _get: GetState, { applyShared }: Deps): GameState["addCard"] =>
  (card, _isRemote) => {
    const normalizedCard = normalizeCardForAdd(card);

    if (
      applyShared((maps) => {
        yUpsertCard(maps, normalizedCard);
      })
    )
      return;

    set((state) => {
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
    });
  };

