import type { GameState } from "@/types";

import { canTapCard } from "@/rules/permissions";
import { logPermission } from "@/rules/logger";
import { emitLog } from "@/logging/logStore";
import { patchCard as yPatchCard } from "@/yjs/yMutations";
import type { Deps, GetState, SetState } from "./types";

export const createTapCard =
  (
    set: SetState,
    get: GetState,
    { applyShared, buildLogContext }: Deps
  ): GameState["tapCard"] =>
  (cardId, actorId, _isRemote) => {
    const actor = actorId ?? get().myPlayerId;
    const card = get().cards[cardId];
    if (!card) return;

    const zone = get().zones[card.zoneId];
    const permission = canTapCard({ actorId: actor }, card, zone);
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
    emitLog(
      "card.tap",
      { actorId: actor, cardId, zoneId: card.zoneId, tapped: newTapped, cardName: card.name },
      buildLogContext()
    );

    if (applyShared((maps) => yPatchCard(maps, cardId, { tapped: newTapped }))) return;

    set((state) => {
      const next = state.cards[cardId];
      if (!next) return state;
      return {
        cards: {
          ...state.cards,
          [cardId]: { ...next, tapped: !next.tapped },
        },
      };
    });
  };

