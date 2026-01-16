import type { GameState } from "@/types";

import { getZoneByType } from "@/lib/gameSelectors";
import { ZONE } from "@/constants/zones";
import { canViewZone } from "@/rules/permissions";
import { logPermission } from "@/rules/logger";
import type { Deps, GetState, SetState } from "./types";

const normalizeCount = (value: number) =>
  Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;

export const createMulligan =
  (
    _set: SetState,
    get: GetState,
    { dispatchIntent }: Deps
  ): GameState["mulligan"] =>
  (playerId, count, actorId, _isRemote) => {
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
        action: "mulligan",
        actorId: actor,
        allowed: false,
        reason: viewPermission.reason,
        details: { playerId },
      });
      return;
    }

    const drawCount = normalizeCount(count);
    dispatchIntent({
      type: "deck.mulligan",
      payload: { playerId, count: drawCount, actorId: actor },
      isRemote: _isRemote,
    });

    logPermission({
      action: "mulligan",
      actorId: actor,
      allowed: true,
      details: { playerId },
    });
  };
