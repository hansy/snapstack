import type { GameState } from "@/types";

import { ZONE } from "@/constants/zones";
import { canModifyCardState } from "@/rules/permissions";
import { logPermission } from "@/rules/logger";
import { isTransformableCard, syncCardStatsToFace } from "@/lib/cardDisplay";
import { computeTransformTargetIndex } from "../cardsModel";
import type { Deps, GetState, SetState } from "./types";

export const createTransformCard =
  (
    _set: SetState,
    get: GetState,
    { dispatchIntent }: Deps
  ): GameState["transformCard"] =>
  (cardId, faceIndex, _isRemote) => {
    const snapshot = get();
    const card = snapshot.cards[cardId];
    if (!card) return;

    const zone = snapshot.zones[card.zoneId];
    if (zone?.type !== ZONE.BATTLEFIELD) return;
    if (!isTransformableCard(card)) return;

    const actor = snapshot.myPlayerId;
    const role = snapshot.viewerRole;
    const permission = canModifyCardState({ actorId: actor, role }, card, zone);
    if (!permission.allowed) {
      logPermission({
        action: "transformCard",
        actorId: actor,
        allowed: false,
        reason: permission.reason,
        details: { cardId, zoneId: zone.id },
      });
      return;
    }

    const { targetIndex } = computeTransformTargetIndex(card, faceIndex);

    dispatchIntent({
      type: "card.transform",
      payload: { cardId, targetIndex, actorId: actor },
      applyLocal: (state) => {
        const currentCard = state.cards[cardId];
        if (!currentCard) return state;
        return {
          cards: {
            ...state.cards,
            [cardId]: syncCardStatsToFace(currentCard, targetIndex),
          },
        };
      },
      isRemote: _isRemote,
    });
  };
