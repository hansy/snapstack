import type { GameState } from "@/types";

import { ZONE } from "@/constants/zones";
import { buildRevealPatch } from "../cardsModel";
import type { Deps, GetState, SetState } from "./types";

export const createSetCardReveal =
  (
    _set: SetState,
    get: GetState,
    { dispatchIntent }: Deps
  ): GameState["setCardReveal"] =>
  (cardId, reveal, actorId, _isRemote) => {
    const actor = actorId ?? get().myPlayerId;
    const snapshot = get();
    if (snapshot.viewerRole === "spectator") return;
    const card = snapshot.cards[cardId];
    if (!card) return;
    if (actor !== card.ownerId) return;

    const zoneType = snapshot.zones[card.zoneId]?.type;
    if (zoneType !== ZONE.HAND && zoneType !== ZONE.LIBRARY) return;

    const updates = buildRevealPatch(card, reveal);

    dispatchIntent({
      type: "card.reveal.set",
      payload: { cardId, reveal, actorId: actor },
      applyLocal: (state) => ({
        cards: {
          ...state.cards,
          [cardId]: {
            ...state.cards[cardId],
            ...updates,
          },
        },
      }),
      isRemote: _isRemote,
    });
  };
