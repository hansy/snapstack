import type { GameState } from "@/types";

import { ZONE } from "@/constants/zones";
import { getZoneByType } from "@/lib/gameSelectors";
import { canViewZone } from "@/rules/permissions";
import { logPermission } from "@/rules/logger";
import type { Deps, GetState, SetState } from "./types";

export const createDrawCard =
  (_set: SetState, get: GetState, { dispatchIntent }: Deps): GameState["drawCard"] =>
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
        action: "drawCard",
        actorId: actor,
        allowed: false,
        reason: viewPermission.reason,
        details: { playerId },
      });
      return;
    }

    logPermission({
      action: "drawCard",
      actorId: actor,
      allowed: true,
      details: { playerId },
    });

    const player = state.players[playerId];
    if (player && typeof player.libraryCount === "number" && player.libraryCount <= 0) {
      if (import.meta.env.DEV) {
        console.warn("[party] drawCard blocked by libraryCount", {
          playerId,
          actorId: actor,
          libraryCount: player.libraryCount,
          deckLoaded: player.deckLoaded,
        });
      }
      return;
    }

    dispatchIntent({
      type: "library.draw",
      payload: { playerId, count: 1, actorId: actor },
      isRemote: _isRemote,
    });
  };
