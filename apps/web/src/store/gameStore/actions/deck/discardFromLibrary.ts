import type { GameState } from "@/types";

import { ZONE } from "@/constants/zones";
import { getZoneByType } from "@/lib/gameSelectors";
import { canViewZone } from "@/rules/permissions";
import { logPermission } from "@/rules/logger";

import type { Deps, GetState, SetState } from "./types";

export const createDiscardFromLibrary = (
  _set: SetState,
  get: GetState,
  { dispatchIntent }: Deps
): GameState["discardFromLibrary"] =>
  (playerId, count = 1, actorId, _isRemote) => {
    const actor = actorId ?? playerId;
    const normalizedCount = Math.max(1, Math.floor(count));
    const state = get();
    const role = actor === state.myPlayerId ? state.viewerRole : "player";
    const libraryZone = getZoneByType(state.zones, playerId, ZONE.LIBRARY);

    if (!libraryZone) return;

    const viewPermission = canViewZone({ actorId: actor, role }, libraryZone, {
      viewAll: true,
    });

    if (!viewPermission.allowed) {
      logPermission({
        action: "discardFromLibrary",
        actorId: actor,
        allowed: false,
        reason: viewPermission.reason,
        details: { playerId, count: normalizedCount },
      });
      return;
    }

    const player = state.players[playerId];
    if (player && typeof player.libraryCount === "number" && player.libraryCount <= 0) {
      return;
    }

    dispatchIntent({
      type: "library.discard",
      payload: { playerId, count: normalizedCount, actorId: actor },
      isRemote: _isRemote,
    });

    logPermission({
      action: "discardFromLibrary",
      actorId: actor,
      allowed: true,
      details: { playerId, count: normalizedCount },
    });
  };
