import type { GameState } from "@/types";

import { getZoneByType } from "@/lib/gameSelectors";
import { ZONE } from "@/constants/zones";
import { canViewZone } from "@/rules/permissions";
import { logPermission } from "@/rules/logger";
import type { Deps, GetState, SetState } from "./types";

export const createResetDeck =
  (
    _set: SetState,
    get: GetState,
    { dispatchIntent }: Deps
  ): GameState["resetDeck"] =>
  (playerId, actorId, _isRemote) => {
    const actor = actorId ?? playerId;
    const role = actor === get().myPlayerId ? get().viewerRole : "player";
    const state = get();
    const libraryZone = getZoneByType(state.zones, playerId, ZONE.LIBRARY);
    if (!libraryZone) return;

    const viewPermission = canViewZone({ actorId: actor, role }, libraryZone, {
      viewAll: true,
    });
    if (!viewPermission.allowed) {
      logPermission({
        action: "resetDeck",
        actorId: actor,
        allowed: false,
        reason: viewPermission.reason,
        details: { playerId },
      });
      return;
    }

    dispatchIntent({
      type: "deck.reset",
      payload: { playerId, actorId: actor },
      isRemote: _isRemote,
    });

    logPermission({
      action: "resetDeck",
      actorId: actor,
      allowed: true,
      details: { playerId },
    });
  };
