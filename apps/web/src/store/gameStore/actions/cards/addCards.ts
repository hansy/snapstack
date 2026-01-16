import type { GameState } from "@/types";

import { enforceZoneCounterRules } from "@/lib/counters";
import { normalizeCardForAdd } from "../cardsModel";
import type { Deps, GetState, SetState } from "./types";

export const createAddCards =
  (_set: SetState, get: GetState, { dispatchIntent }: Deps): GameState["addCards"] =>
  (cards, _isRemote) => {
    if (get().viewerRole === "spectator") return;
    if (!Array.isArray(cards) || cards.length === 0) return;

    const normalizedCards = cards.map((card) => normalizeCardForAdd(card));

    dispatchIntent({
      type: "card.add.batch",
      payload: { cards: normalizedCards },
      applyLocal: (state) => {
        const nextCards = { ...state.cards };
        const nextZones = { ...state.zones };

        normalizedCards.forEach((card) => {
          const zone = nextZones[card.zoneId] ?? state.zones[card.zoneId];
          if (!zone) return;
          const cardWithCounters = {
            ...card,
            counters: enforceZoneCounterRules(card.counters, zone),
          };
          nextCards[cardWithCounters.id] = cardWithCounters;
          const zoneCardIds = nextZones[cardWithCounters.zoneId]?.cardIds ?? zone.cardIds;
          nextZones[cardWithCounters.zoneId] = {
            ...zone,
            cardIds: [...zoneCardIds, cardWithCounters.id],
          };
        });

        return {
          cards: nextCards,
          zones: nextZones,
        };
      },
      isRemote: _isRemote,
    });
  };
