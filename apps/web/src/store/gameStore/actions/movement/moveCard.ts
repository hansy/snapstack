import type { GameState } from "@/types";

import { ZONE, isCommanderZoneType } from "@/constants/zones";
import { canMoveCard } from "@/rules/permissions";
import { logPermission } from "@/rules/logger";
import { emitLog } from "@/logging/logStore";
import { enforceZoneCounterRules } from "@/lib/counters";
import {
  resolveBattlefieldCollisionPosition,
  resolveBattlefieldGroupCollisionPositions,
} from "@/lib/battlefieldCollision";
import { resetCardToFrontFace } from "@/lib/cardDisplay";
import {
  moveCard as yMoveCard,
  patchCard as yPatchCard,
  removeCard as yRemoveCard,
} from "@/yjs/yMutations";
import { syncCommanderDecklistForPlayer } from "@/store/gameStore/actions/deck/commanderDecklist";
import {
  computeRevealPatchAfterMove,
  normalizeMovePosition,
  resolveControllerAfterMove,
  resolveFaceDownAfterMove,
} from "../movementModel";
import { moveCardIdBetweenZones, removeCardFromZones } from "../movementState";
import type { Deps, GetState, SetState } from "./types";

export const createMoveCard =
  (set: SetState, get: GetState, { applyShared, buildLogContext }: Deps): GameState["moveCard"] =>
  (cardId, toZoneId, position, actorId, _isRemote, opts) => {
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
        action: "moveCard",
        actorId: actor,
        allowed: false,
        reason: permission.reason,
        details: { cardId, fromZoneId, toZoneId },
      });
      return;
    }
    logPermission({
      action: "moveCard",
      actorId: actor,
      allowed: true,
      details: { cardId, fromZoneId, toZoneId },
    });

    const isCommanderDestination = isCommanderZoneType(toZone.type);
    const shouldMarkCommander =
      isCommanderDestination && card.ownerId === toZone.ownerId && !card.isCommander && !card.isToken;
    const shouldSyncCommander =
      shouldMarkCommander && actor === get().myPlayerId && card.ownerId === actor;

    const bothBattlefields =
      fromZone.type === ZONE.BATTLEFIELD && toZone.type === ZONE.BATTLEFIELD;
    const sameBattlefield = bothBattlefields && fromZoneId === toZoneId;
    const controlShift = controlWillChange && toZone.type === ZONE.BATTLEFIELD;
    const faceDownResolution = resolveFaceDownAfterMove({
      fromZoneType: fromZone.type,
      toZoneType: toZone.type,
      currentFaceDown: card.faceDown,
      requestedFaceDown: opts?.faceDown,
    });
    const revealPatch = computeRevealPatchAfterMove({
      fromZoneType: fromZone.type,
      toZoneType: toZone.type,
      effectiveFaceDown: faceDownResolution.effectiveFaceDown,
    });

    if (!opts?.suppressLog && !sameBattlefield) {
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

      yMoveCard(maps, cardId, toZoneId, position, {
        skipCollision: opts?.skipCollision,
        groupCollision: opts?.groupCollision,
      });

      if (shouldMarkCommander) {
        yPatchCard(maps, cardId, { isCommander: true });
      }

      if (controlWillChange) {
        yPatchCard(maps, cardId, { controllerId: nextControllerId });
      }

      if (faceDownResolution.patchFaceDown !== undefined) {
        yPatchCard(maps, cardId, { faceDown: faceDownResolution.patchFaceDown });
      }

      if (revealPatch) {
        yPatchCard(maps, cardId, revealPatch);
      }
    });

    const leavingBattlefield =
      fromZone.type === ZONE.BATTLEFIELD && toZone.type !== ZONE.BATTLEFIELD;
    const resetToFront = leavingBattlefield ? resetCardToFrontFace(card) : card;

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
      const newPosition = normalizeMovePosition(position, card.position);
      let resolvedPosition = newPosition;

      if (
        toZone.type === ZONE.BATTLEFIELD &&
        position &&
        (!opts?.skipCollision || opts?.groupCollision)
      ) {
        if (opts?.groupCollision) {
          const resolvedPositions = resolveBattlefieldGroupCollisionPositions({
            movingCardIds: opts.groupCollision.movingCardIds,
            targetPositions: opts.groupCollision.targetPositions,
            orderedCardIds: state.zones[toZoneId]?.cardIds ?? toZone.cardIds,
            getPosition: (id) => cardsCopy[id]?.position,
          });
          resolvedPosition = resolvedPositions[cardId] ?? newPosition;
        } else {
          resolvedPosition = resolveBattlefieldCollisionPosition({
            movingCardId: cardId,
            targetPosition: newPosition,
            orderedCardIds: state.zones[toZoneId]?.cardIds ?? toZone.cardIds,
            getPosition: (id) => cardsCopy[id]?.position,
          });
        }
      }
      const localFaceDown = faceDownResolution.effectiveFaceDown;

      const nextCommanderFlag = shouldMarkCommander ? true : card.isCommander;

      if (fromZoneId === toZoneId) {
        const nextCard = leavingBattlefield ? resetToFront : card;
        cardsCopy[cardId] = {
          ...nextCard,
          ...(revealPatch ?? {}),
          position: resolvedPosition,
          tapped: nextTapped,
          counters: nextCounters,
          faceDown: localFaceDown,
          controllerId: controlWillChange
            ? nextControllerId
            : nextCard.controllerId,
          isCommander: nextCommanderFlag,
        };
        return {
          cards: cardsCopy,
          zones: moveCardIdBetweenZones({
            zones: state.zones,
            cardId,
            fromZoneId,
            toZoneId,
            placement: "top",
          }),
        };
      }

      const nextCard = leavingBattlefield ? resetToFront : card;

      cardsCopy[cardId] = {
        ...nextCard,
        ...(revealPatch ?? {}),
        zoneId: toZoneId,
        position: resolvedPosition,
        tapped: nextTapped,
        counters: nextCounters,
        faceDown: localFaceDown,
        controllerId: controlWillChange ? nextControllerId : nextCard.controllerId,
        isCommander: nextCommanderFlag,
      };

      return {
        cards: cardsCopy,
        zones: moveCardIdBetweenZones({
          zones: state.zones,
          cardId,
          fromZoneId,
          toZoneId,
          placement: "top",
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
