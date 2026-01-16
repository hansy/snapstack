import type { GameState } from "@/types";

import { v4 as uuidv4 } from "uuid";

import { canModifyCardState } from "@/rules/permissions";
import { logPermission } from "@/rules/logger";
import {
  buildDuplicateTokenCard,
  computeDuplicateTokenPosition,
} from "../cardsModel";
import type { Deps, GetState, SetState } from "./types";

export const createDuplicateCard =
  (
    _set: SetState,
    get: GetState,
    { dispatchIntent }: Deps
  ): GameState["duplicateCard"] =>
  (cardId, actorId, _isRemote) => {
    const actor = actorId ?? get().myPlayerId;
    const role = actor === get().myPlayerId ? get().viewerRole : "player";
    const state = get();
    const sourceCard = state.cards[cardId];
    if (!sourceCard) return;

    const currentZone = state.zones[sourceCard.zoneId];
    if (!currentZone) return;

    const tokenPermission = canModifyCardState(
      { actorId: actor, role },
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
    dispatchIntent({
      type: "card.duplicate",
      payload: { cardId, newCardId, actorId: actor },
      isRemote: _isRemote,
    });
    get().addCard(clonedCard, true);
  };
