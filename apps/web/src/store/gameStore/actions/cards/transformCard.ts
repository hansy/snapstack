import type { GameState } from "@/types";

import { ZONE } from "@/constants/zones";
import { canModifyCardState } from "@/rules/permissions";
import { logPermission } from "@/rules/logger";
import { emitLog } from "@/logging/logStore";
import { isTransformableCard, syncCardStatsToFace } from "@/lib/cardDisplay";
import { transformCard as yTransformCard } from "@/yjs/yMutations";
import { computeTransformTargetIndex } from "../cardsModel";
import type { Deps, GetState, SetState } from "./types";

export const createTransformCard =
  (
    set: SetState,
    get: GetState,
    { applyShared, buildLogContext }: Deps
  ): GameState["transformCard"] =>
  (cardId, faceIndex, _isRemote) => {
    const snapshot = get();
    const card = snapshot.cards[cardId];
    if (!card) return;

    const zone = snapshot.zones[card.zoneId];
    if (zone?.type !== ZONE.BATTLEFIELD) return;
    if (!isTransformableCard(card)) return;

    const actor = snapshot.myPlayerId;
    const permission = canModifyCardState({ actorId: actor }, card, zone);
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

    const { targetIndex, toFaceName: targetFaceName } =
      computeTransformTargetIndex(card, faceIndex);

    emitLog(
      "card.transform",
      {
        actorId: actor,
        cardId,
        zoneId: card.zoneId,
        toFaceName: targetFaceName,
        cardName: card.name,
      },
      buildLogContext()
    );

    if (applyShared((maps) => yTransformCard(maps, cardId, targetIndex))) return;

    set((state) => {
      const currentCard = state.cards[cardId];
      if (!currentCard) return state;
      return {
        cards: {
          ...state.cards,
          [cardId]: syncCardStatsToFace(currentCard, targetIndex),
        },
      };
    });
  };

