import type { GameState } from "@/types";

import { getZoneByType } from "@/lib/gameSelectors";
import { ZONE } from "@/constants/zones";
import { canViewZone } from "@/rules/permissions";
import { logPermission } from "@/rules/logger";
import { emitLog } from "@/logging/logStore";
import { unloadDeck as yUnloadDeck } from "@/yjs/yMutations";
import type { Deps, GetState, SetState } from "./types";

export const createUnloadDeck =
  (
    set: SetState,
    get: GetState,
    { applyShared, buildLogContext }: Deps
  ): GameState["unloadDeck"] =>
  (playerId, actorId, _isRemote) => {
    const actor = actorId ?? playerId;
    const state = get();
    const libraryZone = getZoneByType(state.zones, playerId, ZONE.LIBRARY);
    if (!libraryZone) return;

    const viewPermission = canViewZone({ actorId: actor }, libraryZone, {
      viewAll: true,
    });
    if (!viewPermission.allowed) {
      logPermission({
        action: "unloadDeck",
        actorId: actor,
        allowed: false,
        reason: viewPermission.reason,
        details: { playerId },
      });
      return;
    }

    const sharedApplied = applyShared((maps) => {
      yUnloadDeck(maps, playerId);
    });

    if (!sharedApplied) {
      set((current) => {
        const nextCards = { ...current.cards };
        const nextZones: typeof current.zones = {};

        const removeIds = new Set(
          Object.values(current.cards)
            .filter((card) => card.ownerId === playerId)
            .map((card) => card.id)
        );

        Object.values(current.zones).forEach((zone) => {
          const filteredIds = zone.cardIds.filter((id) => !removeIds.has(id));
          nextZones[zone.id] = { ...zone, cardIds: filteredIds };
        });

        removeIds.forEach((id) => {
          Reflect.deleteProperty(nextCards, id);
        });

        const nextPlayers = current.players[playerId]
          ? {
              ...current.players,
              [playerId]: { ...current.players[playerId], deckLoaded: false },
            }
          : current.players;

        return { cards: nextCards, zones: nextZones, players: nextPlayers };
      });
    }

    logPermission({
      action: "unloadDeck",
      actorId: actor,
      allowed: true,
      details: { playerId },
    });
    emitLog("deck.unload", { actorId: actor, playerId }, buildLogContext());
  };

