import type { GameState } from "@/types";

import { getZoneByType } from "@/lib/gameSelectors";
import { ZONE } from "@/constants/zones";
import { canMoveCard } from "@/rules/permissions";
import { logPermission } from "@/rules/logger";
import { emitLog } from "@/logging/logStore";
import type { Deps, GetState, SetState } from "./types";

export const createDrawCard =
  (_set: SetState, get: GetState, { buildLogContext }: Deps): GameState["drawCard"] =>
  (playerId, actorId, _isRemote) => {
    const actor = actorId ?? playerId;
    const state = get();
    const libraryZone = getZoneByType(state.zones, playerId, ZONE.LIBRARY);
    const handZone = getZoneByType(state.zones, playerId, ZONE.HAND);

    if (!libraryZone || !handZone || libraryZone.cardIds.length === 0) return;

    const cardId = libraryZone.cardIds[libraryZone.cardIds.length - 1];
    const card = state.cards[cardId];
    if (!card) return;

    const permission = canMoveCard({
      actorId: actor,
      card,
      fromZone: libraryZone,
      toZone: handZone,
    });
    if (!permission.allowed) {
      logPermission({
        action: "drawCard",
        actorId: actor,
        allowed: false,
        reason: permission.reason,
        details: { playerId, cardId },
      });
      return;
    }

    logPermission({
      action: "drawCard",
      actorId: actor,
      allowed: true,
      details: { playerId, cardId },
    });
    state.moveCard(cardId, handZone.id, undefined, actor, undefined, {
      suppressLog: true,
    });

    emitLog("card.draw", { actorId: actor, playerId, count: 1 }, buildLogContext());
  };

