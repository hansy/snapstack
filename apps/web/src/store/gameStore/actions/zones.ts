import type { StoreApi } from "zustand";

import type { GameState, Zone } from "@/types";
import type { DispatchIntent } from "@/store/gameStore/dispatchIntent";

import { logPermission } from "@/rules/logger";

type SetState = StoreApi<GameState>["setState"];
type GetState = StoreApi<GameState>["getState"];

type Deps = {
  dispatchIntent: DispatchIntent;
};

export const createZoneActions = (
  _set: SetState,
  get: GetState,
  { dispatchIntent }: Deps
): Pick<GameState, "addZone" | "reorderZoneCards"> => ({
  addZone: (zone: Zone, _isRemote?: boolean) => {
    if (get().viewerRole === "spectator") return;
    dispatchIntent({
      type: "zone.add",
      payload: { zone },
      applyLocal: (state) => ({
        zones: { ...state.zones, [zone.id]: zone },
      }),
      isRemote: _isRemote,
    });
  },

  reorderZoneCards: (zoneId, orderedCardIds, actorId, _isRemote) => {
    const actor = actorId ?? get().myPlayerId;
    const role = actor === get().myPlayerId ? get().viewerRole : "player";
    const zone = get().zones[zoneId];
    if (!zone) return;

    if (role === "spectator") {
      logPermission({
        action: "reorderZoneCards",
        actorId: actor,
        allowed: false,
        reason: "Spectators cannot reorder cards",
        details: { zoneId },
      });
      return;
    }

    if (zone.ownerId !== actor) {
      logPermission({
        action: "reorderZoneCards",
        actorId: actor,
        allowed: false,
        reason: "Only zone owner may reorder cards",
        details: { zoneId },
      });
      return;
    }

    const currentIds = zone.cardIds;
    if (currentIds.length !== orderedCardIds.length) return;

    const currentSet = new Set(currentIds);
    const containsSameCards =
      orderedCardIds.every((id) => currentSet.has(id)) &&
      currentIds.every((id) => orderedCardIds.includes(id));
    if (!containsSameCards) return;

    dispatchIntent({
      type: "zone.reorder",
      payload: { zoneId, orderedCardIds, actorId: actor },
      applyLocal: (state) => ({
        zones: {
          ...state.zones,
          [zoneId]: {
            ...state.zones[zoneId],
            cardIds: orderedCardIds,
          },
        },
      }),
      isRemote: _isRemote,
    });
    logPermission({
      action: "reorderZoneCards",
      actorId: actor,
      allowed: true,
      details: { zoneId },
    });
  },
});
