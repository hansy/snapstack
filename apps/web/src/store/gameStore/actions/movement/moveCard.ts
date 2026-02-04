import type { CardId, GameState } from "@/types";

import { ZONE, isCommanderZoneType } from "@/constants/zones";
import { canMoveCard } from "@/rules/permissions";
import { logPermission } from "@/rules/logger";
import { enforceZoneCounterRules } from "@/lib/counters";
import {
  resolveBattlefieldCollisionPosition,
  resolveBattlefieldGroupCollisionPositions,
} from "@/lib/battlefieldCollision";
import { getNormalizedGridSteps } from "@/lib/positions";
import { resetCardToFrontFace } from "@/lib/cardDisplay";
import { syncCommanderDecklistForPlayer } from "@/store/gameStore/actions/deck/commanderDecklist";
import { debugLog, type DebugFlagKey } from "@/lib/debug";
import {
  computeRevealPatchAfterMove,
  normalizeMovePosition,
  resolveControllerAfterMove,
  resolveFaceDownAfterMove,
} from "../movementModel";
import { moveCardIdBetweenZones, removeCardFromZones } from "../movementState";
import type { Deps, GetState, SetState } from "./types";

export const createMoveCard =
  (_set: SetState, get: GetState, { dispatchIntent }: Deps): GameState["moveCard"] =>
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

    const faceDownResolution = resolveFaceDownAfterMove({
      fromZoneType: fromZone.type,
      toZoneType: toZone.type,
      currentFaceDown: card.faceDown,
      currentFaceDownMode: card.faceDownMode,
      requestedFaceDown: opts?.faceDown,
      requestedFaceDownMode: opts?.faceDownMode,
    });
    const revealPatch = computeRevealPatchAfterMove({
      fromZoneType: fromZone.type,
      toZoneType: toZone.type,
      effectiveFaceDown: faceDownResolution.effectiveFaceDown,
    });
    const debugKey: DebugFlagKey = "faceDownDrag";
    const resolvedOpts = (() => {
      if (_isRemote) return opts;
      if (toZone.type !== ZONE.BATTLEFIELD) return opts;
      const sizing = snapshot.battlefieldGridSizing[toZone.ownerId];
      if (!sizing) return opts;

      let nextOpts: typeof opts | undefined = opts ? { ...opts } : undefined;
      let changed = false;

      if (typeof opts?.gridStepY !== "number") {
        const stepY = getNormalizedGridSteps({
          isTapped: card.tapped,
          zoneHeight: sizing.zoneHeightPx,
          viewScale: sizing.viewScale,
          baseCardHeight: sizing.baseCardHeightPx,
          baseCardWidth: sizing.baseCardWidthPx,
        }).stepY;
        if (stepY) {
          if (!nextOpts) nextOpts = {};
          nextOpts.gridStepY = stepY;
          changed = true;
        }
      }

      if (opts?.groupCollision && !opts.groupCollision.stepYById) {
        const stepYById: Record<CardId, number> = {};
        opts.groupCollision.movingCardIds.forEach((id) => {
          const movingCard = snapshot.cards[id];
          if (!movingCard) return;
          const stepY = getNormalizedGridSteps({
            isTapped: movingCard.tapped,
            zoneHeight: sizing.zoneHeightPx,
            viewScale: sizing.viewScale,
            baseCardHeight: sizing.baseCardHeightPx,
            baseCardWidth: sizing.baseCardWidthPx,
          }).stepY;
          if (stepY) stepYById[id] = stepY;
        });
        if (Object.keys(stepYById).length > 0) {
          if (!nextOpts) nextOpts = {};
          nextOpts.groupCollision = {
            ...opts.groupCollision,
            stepYById,
          };
          changed = true;
        }
      }

      return changed ? nextOpts : opts;
    })();

    const applyMove = (state: GameState) => {
      const cardsCopy = { ...state.cards };
      const workingCard = cardsCopy[cardId];
      if (!workingCard) return state;
      const toZoneState = state.zones[toZoneId] ?? toZone;
      const currentFromZoneId = workingCard.zoneId;
      const currentFromZone = state.zones[currentFromZoneId] ?? fromZone;
      if (!toZoneState || !currentFromZone) return state;

      const tokenLeavingBattlefield =
        workingCard.isToken && toZoneState.type !== ZONE.BATTLEFIELD;
      if (tokenLeavingBattlefield) {
        Reflect.deleteProperty(cardsCopy, cardId);
        return {
          cards: cardsCopy,
          zones: removeCardFromZones(state.zones, cardId, [
            currentFromZoneId,
            toZoneId,
          ]),
        };
      }

      const nextTapped =
        toZoneState.type === ZONE.BATTLEFIELD ? workingCard.tapped : false;
      const nextCounters = enforceZoneCounterRules(
        workingCard.counters,
        toZoneState
      );
      const fallbackPosition =
        !position &&
        toZoneState.type === ZONE.BATTLEFIELD &&
        currentFromZone.type !== ZONE.BATTLEFIELD
          ? { x: 0.5, y: 0.5 }
          : position;
      const newPosition = normalizeMovePosition(
        fallbackPosition,
        workingCard.position
      );
      let resolvedPosition = newPosition;

      if (
        toZoneState.type === ZONE.BATTLEFIELD &&
        fallbackPosition &&
        (!resolvedOpts?.skipCollision || resolvedOpts?.groupCollision)
      ) {
        if (resolvedOpts?.groupCollision) {
          const resolvedPositions =
            resolveBattlefieldGroupCollisionPositions({
              movingCardIds: resolvedOpts.groupCollision.movingCardIds,
              targetPositions: resolvedOpts.groupCollision.targetPositions,
              orderedCardIds:
                state.zones[toZoneId]?.cardIds ?? toZoneState.cardIds,
              getPosition: (id) => cardsCopy[id]?.position,
              getStepY: (id) =>
                resolvedOpts.groupCollision?.stepYById?.[id] ??
                resolvedOpts?.gridStepY ??
                getNormalizedGridSteps({ isTapped: cardsCopy[id]?.tapped })
                  .stepY,
            });
          resolvedPosition = resolvedPositions[cardId] ?? newPosition;
        } else {
          const stepY =
            resolvedOpts?.gridStepY ??
            getNormalizedGridSteps({
              isTapped: workingCard.tapped,
            }).stepY;
          resolvedPosition = resolveBattlefieldCollisionPosition({
            movingCardId: cardId,
            targetPosition: newPosition,
            orderedCardIds:
              state.zones[toZoneId]?.cardIds ?? toZoneState.cardIds,
            getPosition: (id) => cardsCopy[id]?.position,
            stepY,
          });
        }
      }

      const localFaceDown = faceDownResolution.effectiveFaceDown;
      const localFaceDownMode = faceDownResolution.effectiveFaceDownMode;
      const nextCommanderFlag = shouldMarkCommander
        ? true
        : workingCard.isCommander;

      const leavingBattlefield =
        currentFromZone.type === ZONE.BATTLEFIELD &&
        toZoneState.type !== ZONE.BATTLEFIELD;
      const nextCard = leavingBattlefield
        ? resetCardToFrontFace(workingCard)
        : workingCard;

      if (workingCard.faceDown || localFaceDown) {
        debugLog(debugKey, "apply-move", {
          cardId,
          fromZoneId: currentFromZoneId,
          toZoneId,
          position: resolvedPosition,
          faceDown: localFaceDown,
          overlayActive: Boolean(state.privateOverlay),
        });
      }

      if (currentFromZoneId === toZoneId) {
        cardsCopy[cardId] = {
          ...nextCard,
          ...(revealPatch ?? {}),
          position: resolvedPosition,
          tapped: nextTapped,
          counters: nextCounters,
          faceDown: localFaceDown,
          faceDownMode: localFaceDownMode,
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
            fromZoneId: currentFromZoneId,
            toZoneId,
            placement: "top",
          }),
        };
      }

      cardsCopy[cardId] = {
        ...nextCard,
        ...(revealPatch ?? {}),
        zoneId: toZoneId,
        position: resolvedPosition,
        tapped: nextTapped,
        counters: nextCounters,
        faceDown: localFaceDown,
        faceDownMode: localFaceDownMode,
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
          fromZoneId: currentFromZoneId,
          toZoneId,
          placement: "top",
        }),
      };
    };

    dispatchIntent({
      type: "card.move",
      payload: {
        cardId,
        toZoneId,
        position,
        actorId: actor,
        opts: resolvedOpts ?? null,
      },
      applyLocal: applyMove,
      isRemote: _isRemote,
    });

    if (shouldSyncCommander) {
      syncCommanderDecklistForPlayer({
        state: get(),
        playerId: actor,
        override: { cardId: card.id, isCommander: true, name: card.name, ownerId: card.ownerId },
      });
    }
  };
