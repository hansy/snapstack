import type { GameState } from "@/types";

import { ZONE } from "@/constants/zones";
import { getZoneByType } from "@/lib/gameSelectors";
import { emitLog } from "@/logging/logStore";
import { canMoveCard } from "@/rules/permissions";
import { logPermission } from "@/rules/logger";

import type { Deps, GetState, SetState } from "./types";

export const createDiscardFromLibrary = (
  _set: SetState,
  get: GetState,
  { buildLogContext }: Deps
): GameState["discardFromLibrary"] =>
  (playerId, count = 1, actorId, _isRemote) => {
    const actor = actorId ?? playerId;
    const normalizedCount = Math.max(1, Math.floor(count));

    let movedCount = 0;
    for (let i = 0; i < normalizedCount; i++) {
      const state = get();
      const role = actor === state.myPlayerId ? state.viewerRole : "player";
      const libraryZone = getZoneByType(state.zones, playerId, ZONE.LIBRARY);
      const graveyardZone = getZoneByType(state.zones, playerId, ZONE.GRAVEYARD);

      if (!libraryZone || !graveyardZone || libraryZone.cardIds.length === 0) break;

      const cardId = libraryZone.cardIds[libraryZone.cardIds.length - 1];
      const card = state.cards[cardId];
      if (!card) break;

      const permission = canMoveCard({
        actorId: actor,
        role,
        card,
        fromZone: libraryZone,
        toZone: graveyardZone,
      });

      if (!permission.allowed) {
        logPermission({
          action: "discardFromLibrary",
          actorId: actor,
          allowed: false,
          reason: permission.reason,
          details: { playerId, cardId },
        });
        break;
      }

      logPermission({
        action: "discardFromLibrary",
        actorId: actor,
        allowed: true,
        details: { playerId, cardId },
      });

      state.moveCard(cardId, graveyardZone.id, undefined, actor, undefined, { suppressLog: true });
      movedCount += 1;
    }

    if (movedCount > 0) {
      emitLog("card.discard", { actorId: actor, playerId, count: movedCount }, buildLogContext());
    }
  };

