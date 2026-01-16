import type { GameState } from "@/types";

import { canTapCard } from "@/rules/permissions";
import { logPermission } from "@/rules/logger";
import type { Deps, GetState, SetState } from "./types";

export const createTapCard =
  (
    _set: SetState,
    get: GetState,
    { dispatchIntent }: Deps
  ): GameState["tapCard"] =>
  (cardId, actorId, _isRemote) => {
    const actor = actorId ?? get().myPlayerId;
    const role = actor === get().myPlayerId ? get().viewerRole : "player";
    const card = get().cards[cardId];
    if (!card) return;

    const zone = get().zones[card.zoneId];
    const permission = canTapCard({ actorId: actor, role }, card, zone);
    if (!permission.allowed) {
      logPermission({
        action: "tapCard",
        actorId: actor,
        allowed: false,
        reason: permission.reason,
        details: { cardId, zoneType: zone?.type },
      });
      return;
    }
    logPermission({ action: "tapCard", actorId: actor, allowed: true, details: { cardId } });

    const newTapped = !card.tapped;
    dispatchIntent({
      type: "card.tap",
      payload: { cardId, tapped: newTapped, actorId: actor },
      applyLocal: (state) => {
        const next = state.cards[cardId];
        if (!next) return state;
        return {
          cards: {
            ...state.cards,
            [cardId]: { ...next, tapped: !next.tapped },
          },
        };
      },
      isRemote: _isRemote,
    });
  };
