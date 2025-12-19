import type { StoreApi } from "zustand";

import type { GameState, Zone } from "@/types";
import type { SharedMaps } from "@/yjs/yMutations";

import { logPermission } from "@/rules/logger";
import { reorderZoneCards as yReorderZoneCards, upsertZone as yUpsertZone } from "@/yjs/yMutations";

type SetState = StoreApi<GameState>["setState"];
type GetState = StoreApi<GameState>["getState"];

type ApplyShared = (fn: (maps: SharedMaps) => void) => boolean;

type Deps = {
  applyShared: ApplyShared;
};

export const createZoneActions = (
  set: SetState,
  get: GetState,
  { applyShared }: Deps
): Pick<GameState, "addZone" | "reorderZoneCards"> => ({
  addZone: (zone: Zone, _isRemote?: boolean) => {
    if (applyShared((maps) => yUpsertZone(maps, zone))) return;
    set((state) => ({
      zones: { ...state.zones, [zone.id]: zone },
    }));
  },

  reorderZoneCards: (zoneId, orderedCardIds, actorId, _isRemote) => {
    const actor = actorId ?? get().myPlayerId;
    const zone = get().zones[zoneId];
    if (!zone) return;

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

    if (applyShared((maps) => yReorderZoneCards(maps, zoneId, orderedCardIds))) return;

    set((state) => ({
      zones: {
        ...state.zones,
        [zoneId]: {
          ...state.zones[zoneId],
          cardIds: orderedCardIds,
        },
      },
    }));

    logPermission({
      action: "reorderZoneCards",
      actorId: actor,
      allowed: true,
      details: { zoneId },
    });
  },
});
