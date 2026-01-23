import type { Card } from "@mtg/shared/types/cards";

import { isCommanderZoneType, isHiddenZoneType, isPublicZoneType, ZONE } from "./constants";
import type {
  FaceDownMoveResolution,
  HiddenReveal,
  HiddenState,
  Maps,
  MoveOpts,
  RevealPatch,
} from "./types";
import {
  buildCardIdentity,
  enforceZoneCounterRules,
  mergeCardIdentity,
  resetCardToFrontFace,
  resolveControllerAfterMove,
  stripCardIdentity,
} from "./cards";
import {
  normalizeMovePosition,
  getNormalizedGridSteps,
  resolveBattlefieldCollisionPosition,
  resolveBattlefieldGroupCollisionPositions,
} from "./positions";
import { readCard, readZone, writeCard, writeZone } from "./yjsStore";
import { placeCardId, removeFromArray } from "./lists";
import { syncLibraryRevealsToAllForPlayer, updatePlayerCounts } from "./hiddenState";

const resolveFaceDownAfterMove = ({
  fromZoneType,
  toZoneType,
  currentFaceDown,
  currentFaceDownMode,
  requestedFaceDown,
  requestedFaceDownMode,
}: {
  fromZoneType: string;
  toZoneType: string;
  currentFaceDown: boolean;
  currentFaceDownMode?: MoveOpts["faceDownMode"];
  requestedFaceDown: boolean | undefined;
  requestedFaceDownMode?: MoveOpts["faceDownMode"];
}): FaceDownMoveResolution => {
  if (requestedFaceDown !== undefined) {
    const nextMode = requestedFaceDown ? requestedFaceDownMode : undefined;
    return {
      effectiveFaceDown: requestedFaceDown,
      patchFaceDown: requestedFaceDown,
      effectiveFaceDownMode: nextMode,
      patchFaceDownMode: requestedFaceDown
        ? requestedFaceDownMode ?? null
        : currentFaceDownMode
          ? null
          : undefined,
    };
  }

  const battlefieldToBattlefield =
    fromZoneType === ZONE.BATTLEFIELD && toZoneType === ZONE.BATTLEFIELD;
  if (battlefieldToBattlefield) {
    return {
      effectiveFaceDown: currentFaceDown,
      patchFaceDown: undefined,
      effectiveFaceDownMode: currentFaceDown ? currentFaceDownMode : undefined,
      patchFaceDownMode: currentFaceDown ? undefined : currentFaceDownMode ? null : undefined,
    };
  }

  return {
    effectiveFaceDown: false,
    patchFaceDown: false,
    effectiveFaceDownMode: undefined,
    patchFaceDownMode: currentFaceDownMode ? null : undefined,
  };
};

const computeRevealPatchAfterMove = ({
  fromZoneType,
  toZoneType,
  effectiveFaceDown,
}: {
  fromZoneType: string;
  toZoneType: string;
  effectiveFaceDown: boolean;
}): RevealPatch => {
  const toHidden =
    toZoneType === ZONE.HAND || toZoneType === ZONE.LIBRARY || toZoneType === ZONE.SIDEBOARD;
  const enteringLibrary = toZoneType === ZONE.LIBRARY && fromZoneType !== ZONE.LIBRARY;
  const faceDownBattlefield = toZoneType === ZONE.BATTLEFIELD && effectiveFaceDown === true;

  if (enteringLibrary || faceDownBattlefield) {
    return { knownToAll: false, revealedToAll: false, revealedTo: [] };
  }

  if (!toHidden && !faceDownBattlefield) {
    return { knownToAll: true, revealedToAll: false, revealedTo: [] };
  }

  return null;
};

const updateCountsForZoneMove = (maps: Maps, hidden: HiddenState, fromOwnerId: string, toOwnerId: string) => {
  updatePlayerCounts(maps, hidden, fromOwnerId);
  if (toOwnerId !== fromOwnerId) {
    updatePlayerCounts(maps, hidden, toOwnerId);
  }
};

export const applyCardMove = (
  maps: Maps,
  hidden: HiddenState,
  payload: Record<string, unknown>,
  placement: "top" | "bottom",
  pushLogEvent: (eventId: string, payload: Record<string, unknown>) => void,
  markHiddenChanged: (impact?: {
    ownerId?: string;
    zoneId?: string;
    reveal?: HiddenReveal;
    prevReveal?: HiddenReveal;
  }) => void
): { ok: true } | { ok: false; error: string } => {
  const cardId = typeof payload.cardId === "string" ? payload.cardId : null;
  const toZoneId = typeof payload.toZoneId === "string" ? payload.toZoneId : null;
  if (!cardId || !toZoneId) return { ok: false, error: "invalid move" };

  const toZone = readZone(maps, toZoneId);
  if (!toZone) return { ok: false, error: "zone not found" };

  const publicCard = readCard(maps, cardId);
  const hiddenCard = !publicCard ? hidden.cards[cardId] : null;
  const card = publicCard ?? hiddenCard;
  if (!card) return { ok: false, error: "card not found" };

  const fromZone = readZone(maps, card.zoneId);
  if (!fromZone) return { ok: false, error: "zone not found" };

  const priorReveal =
    fromZone.type === ZONE.HAND
      ? hidden.handReveals[cardId]
      : fromZone.type === ZONE.LIBRARY
        ? hidden.libraryReveals[cardId]
        : fromZone.type === ZONE.BATTLEFIELD && card.faceDown
          ? hidden.faceDownReveals[cardId]
          : undefined;

  const position =
    payload.position && typeof payload.position === "object"
      ? {
          x:
            typeof (payload.position as Record<string, unknown>).x === "number"
              ? ((payload.position as Record<string, unknown>).x as number)
              : card.position.x,
          y:
            typeof (payload.position as Record<string, unknown>).y === "number"
              ? ((payload.position as Record<string, unknown>).y as number)
              : card.position.y,
        }
      : undefined;

  const opts = payload.opts && typeof payload.opts === "object" ? (payload.opts as MoveOpts) : undefined;
  const actorId = typeof payload.actorId === "string" ? payload.actorId : undefined;

  const nextControllerId = resolveControllerAfterMove(card, fromZone, toZone);
  const controlWillChange = nextControllerId !== card.controllerId;

  const shouldMarkCommander =
    isCommanderZoneType(toZone.type) &&
    card.ownerId === toZone.ownerId &&
    !card.isCommander &&
    !card.isToken;

  const faceDownResolution = resolveFaceDownAfterMove({
    fromZoneType: fromZone.type,
    toZoneType: toZone.type,
    currentFaceDown: card.faceDown,
    currentFaceDownMode: card.faceDownMode,
    requestedFaceDown: opts?.faceDown,
    requestedFaceDownMode: opts?.faceDownMode,
  });

  const sameBattlefield =
    fromZone.type === ZONE.BATTLEFIELD &&
    toZone.type === ZONE.BATTLEFIELD &&
    fromZone.id === toZone.id;

  const fromHidden = isHiddenZoneType(fromZone.type);
  const toHidden = isHiddenZoneType(toZone.type);

  if (opts?.suppressLog) {
    if (fromZone.type === ZONE.LIBRARY && toZone.type === ZONE.HAND) {
      pushLogEvent("card.draw", {
        actorId,
        playerId: fromZone.ownerId,
        count: 1,
      });
    } else if (fromZone.type === ZONE.LIBRARY && toZone.type === ZONE.GRAVEYARD) {
      pushLogEvent("card.discard", {
        actorId,
        playerId: fromZone.ownerId,
        count: 1,
      });
    }
  } else if (!sameBattlefield) {
    const faceDownIdentityForLog =
      card.faceDown && fromZone.type === ZONE.BATTLEFIELD
        ? hidden.faceDownBattlefield[cardId]
        : undefined;
    const leavingFaceDownBattlefield =
      fromZone.type === ZONE.BATTLEFIELD && toZone.type !== ZONE.BATTLEFIELD && card.faceDown;
    const enteringFaceDownBattlefield =
      toZone.type === ZONE.BATTLEFIELD && faceDownResolution.effectiveFaceDown;
    const toPublicZone = isPublicZoneType(toZone.type);
    const shouldHideMoveName =
      !toPublicZone || enteringFaceDownBattlefield || (leavingFaceDownBattlefield && !toPublicZone);
    const movePayload: Record<string, unknown> = {
      actorId,
      cardId,
      fromZoneId: fromZone.id,
      toZoneId,
      placement,
      cardName: shouldHideMoveName ? "a card" : faceDownIdentityForLog?.name ?? card.name,
      fromZoneType: fromZone.type,
      toZoneType: toZone.type,
      faceDown: faceDownResolution.effectiveFaceDown,
      forceHidden: shouldHideMoveName,
    };
    if (controlWillChange && toZone.type === ZONE.BATTLEFIELD) {
      movePayload.gainsControlBy = nextControllerId;
    }
    pushLogEvent("card.move", movePayload);
  }

  const revealPatch = computeRevealPatchAfterMove({
    fromZoneType: fromZone.type,
    toZoneType: toZone.type,
    effectiveFaceDown: faceDownResolution.effectiveFaceDown,
  });

  if (!fromHidden && !toHidden) {
    const leavingBattlefield =
      fromZone.type === ZONE.BATTLEFIELD && toZone.type !== ZONE.BATTLEFIELD;
    const tokenLeavingBattlefield = card.isToken && toZone.type !== ZONE.BATTLEFIELD;
    if (tokenLeavingBattlefield) {
      const nextFromIds = removeFromArray(fromZone.cardIds, cardId);
      writeZone(maps, { ...fromZone, cardIds: nextFromIds });
      maps.cards.delete(cardId);
      return { ok: true };
    }

    const nextTapped = toZone.type === ZONE.BATTLEFIELD ? card.tapped : false;
    const nextCounters = enforceZoneCounterRules(card.counters, toZone);

    const wasFaceDownBattlefield = fromZone.type === ZONE.BATTLEFIELD && card.faceDown;
    const faceDownIdentity = wasFaceDownBattlefield
      ? hidden.faceDownBattlefield[cardId]
      : undefined;
    const cardWithIdentity = mergeCardIdentity(card, faceDownIdentity);

    const fallbackPosition =
      !position && toZone.type === ZONE.BATTLEFIELD && fromZone.type !== ZONE.BATTLEFIELD
        ? { x: 0.5, y: 0.5 }
        : position;
    let resolvedPosition = normalizeMovePosition(fallbackPosition, card.position);
    if (
      toZone.type === ZONE.BATTLEFIELD &&
      fallbackPosition &&
      (!opts?.skipCollision || opts?.groupCollision)
    ) {
      const ordered = toZone.cardIds;
      const cardsById: Record<string, Card> = {};
      ordered.forEach((id) => {
        const entry = readCard(maps, id);
        if (entry) cardsById[id] = entry;
      });

      if (opts?.groupCollision) {
        const movingIds = Array.isArray(opts.groupCollision.movingCardIds)
          ? opts.groupCollision.movingCardIds
          : [];
        const targetPositions =
          opts.groupCollision.targetPositions && typeof opts.groupCollision.targetPositions === "object"
            ? (opts.groupCollision.targetPositions as Record<string, { x: number; y: number } | undefined>)
            : {};
        const resolved = resolveBattlefieldGroupCollisionPositions({
          movingCardIds: movingIds,
          targetPositions,
          orderedCardIds: ordered,
          getPosition: (id) => cardsById[id]?.position,
          getStepY: (id) => getNormalizedGridSteps({ isTapped: cardsById[id]?.tapped }).stepY,
        });
        resolvedPosition = resolved[cardId] ?? resolvedPosition;
      } else {
        const stepY = getNormalizedGridSteps({ isTapped: card.tapped }).stepY;
        resolvedPosition = resolveBattlefieldCollisionPosition({
          movingCardId: cardId,
          targetPosition: resolvedPosition,
          orderedCardIds: ordered,
          getPosition: (id) => cardsById[id]?.position,
          stepY,
        });
      }
    }

    const baseCard = leavingBattlefield ? resetCardToFrontFace(cardWithIdentity) : cardWithIdentity;
    const nextCard: Card = {
      ...baseCard,
      zoneId: toZoneId,
      position: resolvedPosition,
      tapped: nextTapped,
      counters: nextCounters,
      faceDown: faceDownResolution.effectiveFaceDown,
      faceDownMode: faceDownResolution.effectiveFaceDownMode,
      controllerId: controlWillChange ? nextControllerId : baseCard.controllerId,
      isCommander: shouldMarkCommander ? true : baseCard.isCommander,
    };

    if (revealPatch) {
      nextCard.knownToAll = revealPatch.knownToAll ?? nextCard.knownToAll;
      if (revealPatch.revealedToAll !== undefined) {
        nextCard.revealedToAll = revealPatch.revealedToAll;
      }
      if (revealPatch.revealedTo !== undefined) {
        nextCard.revealedTo = revealPatch.revealedTo;
      }
    }

    const willBeFaceDownBattlefield =
      toZone.type === ZONE.BATTLEFIELD && nextCard.faceDown;
    const publicCard = willBeFaceDownBattlefield ? stripCardIdentity(nextCard) : nextCard;

    if (fromZone.id === toZone.id) {
      const nextIds = placeCardId(fromZone.cardIds, cardId, placement);
      writeZone(maps, { ...fromZone, cardIds: nextIds });
      writeCard(maps, publicCard);
    } else {
      const nextFromIds = removeFromArray(fromZone.cardIds, cardId);
      const nextToIds = placeCardId(toZone.cardIds, cardId, placement);
      writeZone(maps, { ...fromZone, cardIds: nextFromIds });
      writeZone(maps, { ...toZone, cardIds: nextToIds });
      writeCard(maps, publicCard);
    }

    if (willBeFaceDownBattlefield && (!wasFaceDownBattlefield || !faceDownIdentity)) {
      hidden.faceDownBattlefield[cardId] = buildCardIdentity(nextCard);
      if (!hidden.faceDownReveals[cardId]) {
        hidden.faceDownReveals[cardId] = {};
      }
      maps.faceDownRevealsToAll.delete(cardId);
      markHiddenChanged({
        ownerId: nextCard.controllerId,
        zoneId: toZone.id,
        reveal: hidden.faceDownReveals[cardId],
      });
    }
    if (wasFaceDownBattlefield && !willBeFaceDownBattlefield) {
      Reflect.deleteProperty(hidden.faceDownBattlefield, cardId);
      Reflect.deleteProperty(hidden.faceDownReveals, cardId);
      maps.faceDownRevealsToAll.delete(cardId);
      markHiddenChanged({
        ownerId: card.controllerId,
        zoneId: fromZone.id,
        reveal: priorReveal,
      });
    }
    return { ok: true };
  }

  if (fromHidden && toHidden) {
    const nextCounters = enforceZoneCounterRules(card.counters, toZone);
    const nextCard: Card = {
      ...card,
      zoneId: toZoneId,
      tapped: false,
      counters: nextCounters,
      faceDown: false,
      faceDownMode: undefined,
      controllerId: controlWillChange ? nextControllerId : card.controllerId,
      isCommander: shouldMarkCommander ? true : card.isCommander,
    };

    if (revealPatch) {
      nextCard.knownToAll = revealPatch.knownToAll ?? nextCard.knownToAll;
      if (revealPatch.revealedToAll !== undefined) {
        nextCard.revealedToAll = revealPatch.revealedToAll;
      }
      if (revealPatch.revealedTo !== undefined) {
        nextCard.revealedTo = revealPatch.revealedTo;
      }
    }

    if (fromZone.type === ZONE.HAND) {
      const nextOrder =
        fromZone.id === toZone.id
          ? placeCardId(hidden.handOrder[fromZone.ownerId] ?? [], cardId, placement)
          : removeFromArray(hidden.handOrder[fromZone.ownerId] ?? [], cardId);
      hidden.handOrder[fromZone.ownerId] = nextOrder;
      writeZone(maps, { ...fromZone, cardIds: nextOrder });
    }
    if (fromZone.type === ZONE.LIBRARY) {
      hidden.libraryOrder[fromZone.ownerId] = removeFromArray(
        hidden.libraryOrder[fromZone.ownerId] ?? [],
        cardId
      );
    }
    if (fromZone.type === ZONE.SIDEBOARD) {
      hidden.sideboardOrder[fromZone.ownerId] = removeFromArray(
        hidden.sideboardOrder[fromZone.ownerId] ?? [],
        cardId
      );
    }

    if (toZone.type === ZONE.HAND) {
      const nextOrder =
        fromZone.id === toZone.id
          ? hidden.handOrder[toZone.ownerId] ?? []
          : placeCardId(hidden.handOrder[toZone.ownerId] ?? [], cardId, placement);
      hidden.handOrder[toZone.ownerId] = nextOrder;
      writeZone(maps, { ...toZone, cardIds: nextOrder });
    }
    if (toZone.type === ZONE.LIBRARY) {
      hidden.libraryOrder[toZone.ownerId] = placeCardId(
        hidden.libraryOrder[toZone.ownerId] ?? [],
        cardId,
        placement
      );
    }
    if (toZone.type === ZONE.SIDEBOARD) {
      hidden.sideboardOrder[toZone.ownerId] = placeCardId(
        hidden.sideboardOrder[toZone.ownerId] ?? [],
        cardId,
        placement
      );
    }

    hidden.cards[cardId] = nextCard;

    if (fromZone.type === ZONE.HAND && toZone.type !== ZONE.HAND) {
      Reflect.deleteProperty(hidden.handReveals, cardId);
      maps.handRevealsToAll.delete(cardId);
    }
    if (fromZone.type === ZONE.LIBRARY && toZone.type !== ZONE.LIBRARY) {
      Reflect.deleteProperty(hidden.libraryReveals, cardId);
      maps.libraryRevealsToAll.delete(cardId);
    }
    if (toZone.type === ZONE.LIBRARY) {
      nextCard.knownToAll = false;
      Reflect.deleteProperty(hidden.libraryReveals, cardId);
      maps.libraryRevealsToAll.delete(cardId);
    }
    if (toZone.type === ZONE.HAND) {
      if (nextCard.knownToAll) {
        hidden.handReveals[cardId] = { toAll: true };
        maps.handRevealsToAll.set(cardId, buildCardIdentity(nextCard));
      } else {
        Reflect.deleteProperty(hidden.handReveals, cardId);
        maps.handRevealsToAll.delete(cardId);
      }
    }

    updateCountsForZoneMove(maps, hidden, fromZone.ownerId, toZone.ownerId);
    if (fromZone.type === ZONE.LIBRARY) {
      syncLibraryRevealsToAllForPlayer(maps, hidden, fromZone.ownerId, fromZone.id);
    }
    if (toZone.type === ZONE.LIBRARY && toZone.ownerId !== fromZone.ownerId) {
      syncLibraryRevealsToAllForPlayer(maps, hidden, toZone.ownerId, toZone.id);
    }
    const nextReveal =
      toZone.type === ZONE.HAND
        ? hidden.handReveals[cardId]
        : toZone.type === ZONE.LIBRARY
          ? hidden.libraryReveals[cardId]
          : undefined;
    markHiddenChanged({
      ownerId: fromZone.ownerId,
      zoneId: fromZone.id,
      reveal: priorReveal,
    });
    if (toZone.ownerId !== fromZone.ownerId) {
      markHiddenChanged({
        ownerId: toZone.ownerId,
        zoneId: toZone.id,
        reveal: nextReveal,
      });
    }
    return { ok: true };
  }

  if (!fromHidden && toHidden) {
    const leavingBattlefield =
      fromZone.type === ZONE.BATTLEFIELD && toZone.type !== ZONE.BATTLEFIELD;
    const tokenLeavingBattlefield =
      card.isToken && fromZone.type === ZONE.BATTLEFIELD && toZone.type !== ZONE.BATTLEFIELD;
    if (tokenLeavingBattlefield) {
      const nextFromIds = removeFromArray(fromZone.cardIds, cardId);
      writeZone(maps, { ...fromZone, cardIds: nextFromIds });
      maps.cards.delete(cardId);
      return { ok: true };
    }

    const nextCounters = enforceZoneCounterRules(card.counters, toZone);
    const wasFaceDownBattlefield = fromZone.type === ZONE.BATTLEFIELD && card.faceDown;
    const faceDownIdentity = wasFaceDownBattlefield
      ? hidden.faceDownBattlefield[cardId]
      : undefined;
    const cardWithIdentity = mergeCardIdentity(card, faceDownIdentity);
    const baseCard = leavingBattlefield ? resetCardToFrontFace(cardWithIdentity) : cardWithIdentity;
    const nextCard: Card = {
      ...baseCard,
      zoneId: toZoneId,
      tapped: false,
      counters: nextCounters,
      faceDown: false,
      faceDownMode: undefined,
      controllerId: controlWillChange ? nextControllerId : baseCard.controllerId,
      isCommander: shouldMarkCommander ? true : baseCard.isCommander,
    };

    if (revealPatch) {
      nextCard.knownToAll = revealPatch.knownToAll ?? nextCard.knownToAll;
      if (revealPatch.revealedToAll !== undefined) {
        nextCard.revealedToAll = revealPatch.revealedToAll;
      }
      if (revealPatch.revealedTo !== undefined) {
        nextCard.revealedTo = revealPatch.revealedTo;
      }
    }

    const nextFromIds = removeFromArray(fromZone.cardIds, cardId);
    writeZone(maps, { ...fromZone, cardIds: nextFromIds });
    maps.cards.delete(cardId);

    if (wasFaceDownBattlefield) {
      Reflect.deleteProperty(hidden.faceDownBattlefield, cardId);
      Reflect.deleteProperty(hidden.faceDownReveals, cardId);
      maps.faceDownRevealsToAll.delete(cardId);
    }

    hidden.cards[cardId] = nextCard;
    if (toZone.type === ZONE.HAND) {
      const nextOrder = placeCardId(hidden.handOrder[toZone.ownerId] ?? [], cardId, placement);
      hidden.handOrder[toZone.ownerId] = nextOrder;
      writeZone(maps, { ...toZone, cardIds: nextOrder });
      if (nextCard.knownToAll) {
        hidden.handReveals[cardId] = { toAll: true };
        maps.handRevealsToAll.set(cardId, buildCardIdentity(nextCard));
      } else {
        Reflect.deleteProperty(hidden.handReveals, cardId);
        maps.handRevealsToAll.delete(cardId);
      }
    } else if (toZone.type === ZONE.LIBRARY) {
      hidden.libraryOrder[toZone.ownerId] = placeCardId(
        hidden.libraryOrder[toZone.ownerId] ?? [],
        cardId,
        placement
      );
      Reflect.deleteProperty(hidden.libraryReveals, cardId);
      maps.libraryRevealsToAll.delete(cardId);
      nextCard.knownToAll = false;
    } else if (toZone.type === ZONE.SIDEBOARD) {
      hidden.sideboardOrder[toZone.ownerId] = placeCardId(
        hidden.sideboardOrder[toZone.ownerId] ?? [],
        cardId,
        placement
      );
    }

    updateCountsForZoneMove(maps, hidden, toZone.ownerId, toZone.ownerId);
    if (toZone.type === ZONE.LIBRARY) {
      syncLibraryRevealsToAllForPlayer(maps, hidden, toZone.ownerId, toZone.id);
    }
    const nextReveal =
      toZone.type === ZONE.HAND
        ? hidden.handReveals[cardId]
        : toZone.type === ZONE.LIBRARY
          ? hidden.libraryReveals[cardId]
          : undefined;
    markHiddenChanged({
      ownerId: toZone.ownerId,
      zoneId: toZone.id,
      reveal: nextReveal,
    });
    return { ok: true };
  }

  if (fromHidden && !toHidden) {
    if (fromZone.type === ZONE.HAND) {
      const nextOrder = removeFromArray(hidden.handOrder[fromZone.ownerId] ?? [], cardId);
      hidden.handOrder[fromZone.ownerId] = nextOrder;
      writeZone(maps, { ...fromZone, cardIds: nextOrder });
      Reflect.deleteProperty(hidden.handReveals, cardId);
      maps.handRevealsToAll.delete(cardId);
    }
    if (fromZone.type === ZONE.LIBRARY) {
      hidden.libraryOrder[fromZone.ownerId] = removeFromArray(
        hidden.libraryOrder[fromZone.ownerId] ?? [],
        cardId
      );
      Reflect.deleteProperty(hidden.libraryReveals, cardId);
      maps.libraryRevealsToAll.delete(cardId);
    }
    if (fromZone.type === ZONE.SIDEBOARD) {
      hidden.sideboardOrder[fromZone.ownerId] = removeFromArray(
        hidden.sideboardOrder[fromZone.ownerId] ?? [],
        cardId
      );
    }

    const nextCounters = enforceZoneCounterRules(card.counters, toZone);
    const fallbackPosition =
      !position && toZone.type === ZONE.BATTLEFIELD && fromZone.type !== ZONE.BATTLEFIELD
        ? { x: 0.5, y: 0.5 }
        : position;
    let resolvedPosition = normalizeMovePosition(fallbackPosition, card.position);
    if (
      toZone.type === ZONE.BATTLEFIELD &&
      fallbackPosition &&
      (!opts?.skipCollision || opts?.groupCollision)
    ) {
      const ordered = toZone.cardIds;
      const cardsById: Record<string, Card> = {};
      ordered.forEach((id) => {
        const entry = readCard(maps, id);
        if (entry) cardsById[id] = entry;
      });

      if (opts?.groupCollision) {
        const movingIds = Array.isArray(opts.groupCollision.movingCardIds)
          ? opts.groupCollision.movingCardIds
          : [];
        const targetPositions =
          opts.groupCollision.targetPositions && typeof opts.groupCollision.targetPositions === "object"
            ? (opts.groupCollision.targetPositions as Record<string, { x: number; y: number } | undefined>)
            : {};
        const resolved = resolveBattlefieldGroupCollisionPositions({
          movingCardIds: movingIds,
          targetPositions,
          orderedCardIds: ordered,
          getPosition: (id) => cardsById[id]?.position,
          getStepY: (id) => getNormalizedGridSteps({ isTapped: cardsById[id]?.tapped }).stepY,
        });
        resolvedPosition = resolved[cardId] ?? resolvedPosition;
      } else {
        const stepY = getNormalizedGridSteps({ isTapped: card.tapped }).stepY;
        resolvedPosition = resolveBattlefieldCollisionPosition({
          movingCardId: cardId,
          targetPosition: resolvedPosition,
          orderedCardIds: ordered,
          getPosition: (id) => cardsById[id]?.position,
          stepY,
        });
      }
    }

    const nextCard: Card = {
      ...card,
      zoneId: toZoneId,
      position: resolvedPosition,
      tapped: toZone.type === ZONE.BATTLEFIELD ? card.tapped : false,
      counters: nextCounters,
      faceDown: toZone.type === ZONE.BATTLEFIELD ? faceDownResolution.effectiveFaceDown : false,
      faceDownMode:
        toZone.type === ZONE.BATTLEFIELD ? faceDownResolution.effectiveFaceDownMode : undefined,
      controllerId: controlWillChange ? nextControllerId : card.controllerId,
      isCommander: shouldMarkCommander ? true : card.isCommander,
    };

    if (revealPatch) {
      nextCard.knownToAll = revealPatch.knownToAll ?? nextCard.knownToAll;
      if (revealPatch.revealedToAll !== undefined) {
        nextCard.revealedToAll = revealPatch.revealedToAll;
      }
      if (revealPatch.revealedTo !== undefined) {
        nextCard.revealedTo = revealPatch.revealedTo;
      }
    }

    const nextToIds = placeCardId(toZone.cardIds, cardId, placement);
    writeZone(maps, { ...toZone, cardIds: nextToIds });
    const willBeFaceDownBattlefield =
      toZone.type === ZONE.BATTLEFIELD && nextCard.faceDown;
    const publicCard = willBeFaceDownBattlefield ? stripCardIdentity(nextCard) : nextCard;
    writeCard(maps, publicCard);
    Reflect.deleteProperty(hidden.cards, cardId);

    if (willBeFaceDownBattlefield) {
      hidden.faceDownBattlefield[cardId] = buildCardIdentity(nextCard);
      hidden.faceDownReveals[cardId] = {};
      maps.faceDownRevealsToAll.delete(cardId);
    }

    updateCountsForZoneMove(maps, hidden, fromZone.ownerId, fromZone.ownerId);
    if (fromZone.type === ZONE.LIBRARY) {
      syncLibraryRevealsToAllForPlayer(maps, hidden, fromZone.ownerId, fromZone.id);
    }
    markHiddenChanged({
      ownerId: fromZone.ownerId,
      zoneId: fromZone.id,
      reveal: priorReveal,
    });
    return { ok: true };
  }

  return { ok: true };
};
