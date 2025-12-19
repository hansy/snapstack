import type { GameState } from "@/types";

import { ZONE } from "@/constants/zones";
import { patchCard as yPatchCard } from "@/yjs/yMutations";
import { buildRevealPatch } from "../cardsModel";
import type { Deps, GetState, SetState } from "./types";

export const createSetCardReveal =
  (
    set: SetState,
    get: GetState,
    { applyShared }: Deps
  ): GameState["setCardReveal"] =>
  (cardId, reveal, actorId, _isRemote) => {
    const actor = actorId ?? get().myPlayerId;
    const snapshot = get();
    const card = snapshot.cards[cardId];
    if (!card) return;
    if (actor !== card.ownerId) return;

    const zoneType = snapshot.zones[card.zoneId]?.type;
    if (zoneType !== ZONE.HAND && zoneType !== ZONE.LIBRARY) return;

    const updates = buildRevealPatch(card, reveal);

    if (
      applyShared((maps) => {
        yPatchCard(maps, cardId, updates);
      })
    )
      return;

    set((state) => ({
      cards: {
        ...state.cards,
        [cardId]: {
          ...state.cards[cardId],
          ...updates,
        },
      },
    }));
  };

