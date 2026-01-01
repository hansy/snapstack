import type { GameState } from "@/types";

import { getZoneByType } from "@/lib/gameSelectors";
import { ZONE } from "@/constants/zones";
import { canViewZone } from "@/rules/permissions";
import { logPermission } from "@/rules/logger";
import { resetCardToFrontFace } from "@/lib/cardDisplay";
import { enforceZoneCounterRules } from "@/lib/counters";
import { emitLog } from "@/logging/logStore";
import { resetDeck as yResetDeck } from "@/yjs/yMutations";
import type { Deps, GetState, SetState } from "./types";

export const createResetDeck =
  (
    set: SetState,
    get: GetState,
    { applyShared, buildLogContext }: Deps
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

    const sharedApplied = applyShared((maps) => {
      yResetDeck(maps, playerId);
    });

    if (!sharedApplied) {
      set((current) => {
        const nextCards = { ...current.cards };
        const nextZones = { ...current.zones };

        const ownedCards = Object.values(current.cards).filter(
          (card) => card.ownerId === playerId
        );
        const libraryKeeps =
          nextZones[libraryZone.id]?.cardIds.filter((id) => {
            const card = nextCards[id];
            return card && card.ownerId !== playerId;
          }) ?? [];
        libraryKeeps.forEach((id) => {
          const card = nextCards[id];
          if (!card) return;
          nextCards[id] = {
            ...card,
            knownToAll: false,
            revealedToAll: false,
            revealedTo: [],
          };
        });

        const toLibrary: string[] = [];

        ownedCards.forEach((card) => {
          const fromZone = nextZones[card.zoneId];
          if (fromZone && fromZone.ownerId === playerId) {
            const fromType: string = fromZone.type;
            if (
              fromType === ZONE.COMMANDER ||
              fromType === "command" ||
              fromType === ZONE.SIDEBOARD
            ) {
              return;
            }
          }
          if (fromZone) {
            nextZones[card.zoneId] = {
              ...fromZone,
              cardIds: fromZone.cardIds.filter((id) => id !== card.id),
            };
          }

          if (card.isToken === true) {
            Reflect.deleteProperty(nextCards, card.id);
            return;
          }

          const resetCard = resetCardToFrontFace(card);
          nextCards[card.id] = {
            ...resetCard,
            zoneId: libraryZone.id,
            tapped: false,
            faceDown: false,
            controllerId: card.ownerId,
            knownToAll: false,
            revealedToAll: false,
            revealedTo: [],
            position: { x: 0, y: 0 },
            rotation: 0,
            customText: undefined,
            counters: enforceZoneCounterRules(resetCard.counters, libraryZone),
          };
          toLibrary.push(card.id);
        });

        const shuffled = [...libraryKeeps, ...toLibrary].sort(() => Math.random() - 0.5);
        nextZones[libraryZone.id] = { ...nextZones[libraryZone.id], cardIds: shuffled };

        return { cards: nextCards, zones: nextZones };
      });
    }

    logPermission({
      action: "resetDeck",
      actorId: actor,
      allowed: true,
      details: { playerId },
    });
    emitLog("deck.reset", { actorId: actor, playerId }, buildLogContext());
  };
