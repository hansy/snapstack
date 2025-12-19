import type { GameState } from "@/types";

import { ZONE } from "@/constants/zones";
import { canMoveCard } from "@/rules/permissions";
import { logPermission } from "@/rules/logger";
import { emitLog } from "@/logging/logStore";
import { enforceZoneCounterRules } from "@/lib/counters";
import { resetCardToFrontFace } from "@/lib/cardDisplay";
import {
  moveCard as yMoveCard,
  patchCard as yPatchCard,
  removeCard as yRemoveCard,
  reorderZoneCards as yReorderZoneCards,
  sharedSnapshot,
} from "@/yjs/yMutations";
import {
  computeRevealPatchAfterMove,
  resolveControllerAfterMove,
  resolveFaceDownAfterMove,
} from "../movementModel";
import {
  moveCardIdBetweenZones,
  placeCardId,
  removeCardFromZones,
} from "../movementState";
import type { Deps, GetState, SetState } from "./types";

export const createMoveCardToBottom =
  (
    set: SetState,
    get: GetState,
    { applyShared, buildLogContext }: Deps
  ): GameState["moveCardToBottom"] =>
  (cardId, toZoneId, actorId, _isRemote) => {
    const actor = actorId ?? get().myPlayerId;
    const snapshot = get();
    const card = snapshot.cards[cardId];
    if (!card) return;

    const fromZoneId = card.zoneId;
    const fromZone = snapshot.zones[fromZoneId];
    const toZone = snapshot.zones[toZoneId];
    if (!fromZone || !toZone) return;

    const nextControllerId = resolveControllerAfterMove(card, fromZone, toZone);
    const controlWillChange = nextControllerId !== card.controllerId;
    const permission = canMoveCard({ actorId: actor, card, fromZone, toZone });
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

    const bothBattlefields =
      fromZone.type === ZONE.BATTLEFIELD && toZone.type === ZONE.BATTLEFIELD;
    const sameBattlefield = bothBattlefields && fromZoneId === toZoneId;
    const controlShift = controlWillChange && toZone.type === ZONE.BATTLEFIELD;
    const faceDownResolution = resolveFaceDownAfterMove({
      fromZoneType: fromZone.type,
      toZoneType: toZone.type,
      currentFaceDown: card.faceDown,
      requestedFaceDown: undefined,
    });
    const revealPatch = computeRevealPatchAfterMove({
      fromZoneType: fromZone.type,
      toZoneType: toZone.type,
      effectiveFaceDown: faceDownResolution.effectiveFaceDown,
    });

    if (!sameBattlefield) {
      const movePayload: Record<string, unknown> = {
        actorId: actor,
        cardId,
        fromZoneId,
        toZoneId,
        cardName:
          toZone.type === ZONE.BATTLEFIELD && faceDownResolution.effectiveFaceDown
            ? "a card"
            : card.name,
        fromZoneType: fromZone.type,
        toZoneType: toZone.type,
        faceDown: faceDownResolution.effectiveFaceDown,
      };
      if (controlShift) movePayload.gainsControlBy = nextControllerId;
      emitLog("card.move", movePayload, buildLogContext());
    }

    applyShared((maps) => {
      const tokenLeavingBattlefield =
        card.isToken && toZone.type !== ZONE.BATTLEFIELD;
      if (tokenLeavingBattlefield) {
        yRemoveCard(maps, cardId);
        return;
      }

      yMoveCard(maps, cardId, toZoneId);

      if (controlWillChange) {
        yPatchCard(maps, cardId, { controllerId: nextControllerId });
      }

      if (faceDownResolution.patchFaceDown !== undefined) {
        yPatchCard(maps, cardId, { faceDown: faceDownResolution.patchFaceDown });
      }

      const snapshot = sharedSnapshot(maps);
      const toOrder = snapshot.zones[toZoneId]?.cardIds ?? [];
      const reordered = placeCardId(toOrder, cardId, "bottom");
      yReorderZoneCards(maps, toZoneId, reordered);

      if (revealPatch) {
        yPatchCard(maps, cardId, revealPatch);
      }
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

      const nextCard = leavingBattlefield ? resetToFront : card;
      cardsCopy[cardId] = {
        ...nextCard,
        zoneId: toZoneId,
        tapped: nextTapped,
        counters: nextCounters,
        faceDown: faceDownResolution.effectiveFaceDown,
        controllerId: controlWillChange ? nextControllerId : nextCard.controllerId,
        ...(revealPatch ?? {}),
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
  };

