import type { GameState } from "@/types";

import { ZONE, isCommanderZoneType } from "@/constants/zones";
import { canMoveCard } from "@/rules/permissions";
import { logPermission } from "@/rules/logger";
import { enforceZoneCounterRules } from "@/lib/counters";
import { resetCardToFrontFace } from "@/lib/cardDisplay";
import { syncCommanderDecklistForPlayer } from "@/store/gameStore/actions/deck/commanderDecklist";
import {
  computeRevealPatchAfterMove,
  resolveControllerAfterMove,
  resolveFaceDownAfterMove,
} from "../movementModel";
import { moveCardIdBetweenZones, removeCardFromZones } from "../movementState";
import type { Deps, GetState, SetState } from "./types";

export const createMoveCardToBottom =
  (
    set: SetState,
    get: GetState,
    { dispatchIntent }: Deps
  ): GameState["moveCardToBottom"] =>
  (cardId, toZoneId, actorId, _isRemote) => {
    const actor = actorId ?? get().myPlayerId;
    const role = actor === get().myPlayerId ? get().viewerRole : "player";
    const snapshot = get();
    const card = snapshot.cards[cardId];
    if (!card) return;

    const fromZoneId = card.zoneId;
    const fromZone = snapshot.zones[fromZoneId];
    const toZone = snapshot.zones[toZoneId];
    if (!fromZone || !toZone) return;

    const nextControllerId = resolveControllerAfterMove(card, fromZone, toZone);
    const controlWillChange = nextControllerId !== card.controllerId;
    const permission = canMoveCard({
      actorId: actor,
      role,
      card,
      fromZone,
      toZone,
    });
    if (!permission.allowed) {
      logPermission({
        action: "moveCardToBottom",
        actorId: actor,
        allowed: false,
        reason: permission.reason,
        details: { cardId, fromZoneId, toZoneId },
      });
      return;
    }
    logPermission({
      action: "moveCardToBottom",
      actorId: actor,
      allowed: true,
      details: { cardId, fromZoneId, toZoneId },
    });

    const isCommanderDestination = isCommanderZoneType(toZone.type);
    const shouldMarkCommander =
      isCommanderDestination && card.ownerId === toZone.ownerId && !card.isCommander && !card.isToken;
    const shouldSyncCommander =
      shouldMarkCommander && actor === get().myPlayerId && card.ownerId === actor;

    const faceDownResolution = resolveFaceDownAfterMove({
      fromZoneType: fromZone.type,
      toZoneType: toZone.type,
      currentFaceDown: card.faceDown,
      currentFaceDownMode: card.faceDownMode,
      requestedFaceDown: undefined,
      requestedFaceDownMode: undefined,
    });
    const revealPatch = computeRevealPatchAfterMove({
      fromZoneType: fromZone.type,
      toZoneType: toZone.type,
      effectiveFaceDown: faceDownResolution.effectiveFaceDown,
    });

    dispatchIntent({
      type: "card.move",
      payload: { cardId, toZoneId, actorId: actor, placement: "bottom" },
      isRemote: _isRemote,
    });

    const leavingBattlefield =
      fromZone.type === ZONE.BATTLEFIELD && toZone.type !== ZONE.BATTLEFIELD;

    const tokenLeavingBattlefield =
      card.isToken && toZone.type !== ZONE.BATTLEFIELD;
    if (tokenLeavingBattlefield) {
      set((state) => {
        const nextCards = { ...state.cards };
        Reflect.deleteProperty(nextCards, cardId);
        return {
          cards: nextCards,
          zones: removeCardFromZones(state.zones, cardId, [fromZoneId, toZoneId]),
        };
      });
      return;
    }

    set((state) => {
      const cardsCopy = { ...state.cards };

      const nextTapped = toZone.type === ZONE.BATTLEFIELD ? card.tapped : false;
      const nextCounters = enforceZoneCounterRules(card.counters, toZone);
      const resetToFront = resetCardToFrontFace(card);
      const nextCommanderFlag = shouldMarkCommander ? true : card.isCommander;

      const nextCard = leavingBattlefield ? resetToFront : card;
      cardsCopy[cardId] = {
        ...nextCard,
        zoneId: toZoneId,
        tapped: nextTapped,
        counters: nextCounters,
        faceDown: faceDownResolution.effectiveFaceDown,
        faceDownMode: faceDownResolution.effectiveFaceDownMode,
        controllerId: controlWillChange ? nextControllerId : nextCard.controllerId,
        ...(revealPatch ?? {}),
        isCommander: nextCommanderFlag,
      };

      return {
        cards: cardsCopy,
        zones: moveCardIdBetweenZones({
          zones: state.zones,
          cardId,
          fromZoneId,
          toZoneId,
          placement: "bottom",
        }),
      };
    });

    if (shouldSyncCommander) {
      syncCommanderDecklistForPlayer({
        state: get(),
        playerId: actor,
        override: { cardId: card.id, isCommander: true, name: card.name, ownerId: card.ownerId },
      });
    }
  };
