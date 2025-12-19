import type { GameState } from "@/types";

import { v4 as uuidv4 } from "uuid";

import { canModifyCardState } from "@/rules/permissions";
import { logPermission } from "@/rules/logger";
import { emitLog } from "@/logging/logStore";
import { duplicateCard as yDuplicateCard } from "@/yjs/yMutations";
import {
  buildDuplicateTokenCard,
  computeDuplicateTokenPosition,
} from "../cardsModel";
import type { Deps, GetState, SetState } from "./types";

export const createDuplicateCard =
  (
    _set: SetState,
    get: GetState,
    { applyShared, buildLogContext }: Deps
  ): GameState["duplicateCard"] =>
  (cardId, actorId, _isRemote) => {
    const actor = actorId ?? get().myPlayerId;
    const state = get();
    const sourceCard = state.cards[cardId];
    if (!sourceCard) return;

    const currentZone = state.zones[sourceCard.zoneId];
    if (!currentZone) return;

    const tokenPermission = canModifyCardState(
      { actorId: actor },
      sourceCard,
      currentZone
    );
    if (!tokenPermission.allowed) {
      logPermission({
        action: "duplicateCard",
        actorId: actor,
        allowed: false,
        reason: tokenPermission.reason,
        details: { cardId, zoneId: currentZone.id },
      });
      return;
    }

    const newCardId = uuidv4();
    const position = computeDuplicateTokenPosition({
      sourceCard,
      orderedCardIds: currentZone.cardIds,
      cardsById: state.cards,
    });
    const clonedCard = buildDuplicateTokenCard({
      sourceCard,
      newCardId,
      position,
    });

    logPermission({
      action: "duplicateCard",
      actorId: actor,
      allowed: true,
      details: { cardId, newCardId, zoneId: currentZone.id },
    });
    emitLog(
      "card.duplicate",
      {
        actorId: actor,
        sourceCardId: cardId,
        newCardId,
        zoneId: currentZone.id,
        cardName: sourceCard.name,
      },
      buildLogContext()
    );
    if (applyShared((maps) => yDuplicateCard(maps, cardId, newCardId))) return;
    get().addCard(clonedCard, _isRemote);
  };

