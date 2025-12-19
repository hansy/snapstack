import type { GameState } from "@/types";

import { getZoneByType } from "@/lib/gameSelectors";
import { ZONE } from "@/constants/zones";
import { canViewZone } from "@/rules/permissions";
import { logPermission } from "@/rules/logger";
import { emitLog } from "@/logging/logStore";
import {
  patchCard as yPatchCard,
  reorderZoneCards as yReorderZoneCards,
  sharedSnapshot,
} from "@/yjs/yMutations";
import type { Deps, GetState, SetState } from "./types";

export const createShuffleLibrary =
  (
    set: SetState,
    get: GetState,
    { applyShared, buildLogContext }: Deps
  ): GameState["shuffleLibrary"] =>
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
        action: "shuffleLibrary",
        actorId: actor,
        allowed: false,
        reason: viewPermission.reason,
        details: { playerId },
      });
      return;
    }

    const sharedApplied = applyShared((maps) => {
      const snapshot = sharedSnapshot(maps);
      const zone = snapshot.zones[libraryZone.id];
      if (!zone) return;
      const shuffledIds = [...zone.cardIds].sort(() => Math.random() - 0.5);
      yReorderZoneCards(maps, libraryZone.id, shuffledIds);
      zone.cardIds.forEach((id) => {
        yPatchCard(maps, id, { knownToAll: false, revealedToAll: false, revealedTo: [] });
      });
    });

    if (!sharedApplied) {
      set((state) => {
        const shuffledIds = [...(state.zones[libraryZone.id]?.cardIds || [])].sort(
          () => Math.random() - 0.5
        );
        const cardsCopy = { ...state.cards };
        shuffledIds.forEach((id) => {
          const card = cardsCopy[id];
          if (!card) return;
          cardsCopy[id] = {
            ...card,
            knownToAll: false,
            revealedToAll: false,
            revealedTo: [],
          };
        });

        return {
          cards: cardsCopy,
          zones: {
            ...state.zones,
            [libraryZone.id]: { ...state.zones[libraryZone.id], cardIds: shuffledIds },
          },
        };
      });
    }

    logPermission({
      action: "shuffleLibrary",
      actorId: actor,
      allowed: true,
      details: { playerId },
    });

    emitLog("library.shuffle", { actorId: actor, playerId }, buildLogContext());
  };

