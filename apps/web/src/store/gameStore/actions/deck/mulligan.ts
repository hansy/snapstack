import type { GameState } from "@/types";

import { enforceZoneCounterRules } from "@/lib/counters";
import { resetCardToFrontFace } from "@/lib/cardDisplay";
import { getZoneByType } from "@/lib/gameSelectors";
import { ZONE } from "@/constants/zones";
import { canViewZone } from "@/rules/permissions";
import { logPermission } from "@/rules/logger";
import { emitLog } from "@/logging/logStore";
import {
  moveCard as yMoveCard,
  resetDeck as yResetDeck,
  sharedSnapshot,
} from "@/yjs/yMutations";
import type { Deps, GetState, SetState } from "./types";

const normalizeCount = (value: number) =>
  Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;

export const createMulligan =
  (
    set: SetState,
    get: GetState,
    { applyShared, buildLogContext }: Deps
  ): GameState["mulligan"] =>
  (playerId, count, actorId, _isRemote) => {
    const actor = actorId ?? playerId;
    const role = actor === get().myPlayerId ? get().viewerRole : "player";
    const state = get();
    const libraryZone = getZoneByType(state.zones, playerId, ZONE.LIBRARY);
    const handZone = getZoneByType(state.zones, playerId, ZONE.HAND);
    if (!libraryZone || !handZone) return;

    const viewPermission = canViewZone({ actorId: actor, role }, libraryZone, {
      viewAll: true,
    });
    if (!viewPermission.allowed) {
      logPermission({
        action: "mulligan",
        actorId: actor,
        allowed: false,
        reason: viewPermission.reason,
        details: { playerId },
      });
      return;
    }

    const drawCount = normalizeCount(count);
    const isCommanderZoneType = (type: string) => type === ZONE.COMMANDER || type === "command";

    const libraryKeeps =
      state.zones[libraryZone.id]?.cardIds.filter((id) => {
        const card = state.cards[id];
        return card && card.ownerId !== playerId;
      }) ?? [];

    const ownedCount = Object.values(state.cards).filter((card) => {
      if (card.ownerId !== playerId || card.isToken) return false;
      const fromZone = state.zones[card.zoneId];
      return !(
        fromZone &&
        fromZone.ownerId === playerId &&
        isCommanderZoneType(fromZone.type)
      );
    }).length;

    const estimatedDrawCount =
      drawCount > 0 ? Math.min(drawCount, libraryKeeps.length + ownedCount) : 0;

    let sharedDrawCount = 0;

    const sharedApplied = applyShared((maps) => {
      yResetDeck(maps, playerId);
      if (drawCount <= 0) return;

      const snapshot = sharedSnapshot(maps);
      const library = Object.values(snapshot.zones).find(
        (zone) => zone.ownerId === playerId && zone.type === ZONE.LIBRARY
      );
      const hand = Object.values(snapshot.zones).find(
        (zone) => zone.ownerId === playerId && zone.type === ZONE.HAND
      );
      if (!library || !hand) return;

      const drawIds = library.cardIds.slice(-drawCount);
      sharedDrawCount = drawIds.length;
      for (let i = drawIds.length - 1; i >= 0; i--) {
        yMoveCard(maps, drawIds[i], hand.id);
      }
    });

    let localDrawCount = 0;

    if (!sharedApplied) {
      set((current) => {
        const currentLibrary = getZoneByType(current.zones, playerId, ZONE.LIBRARY);
        const currentHand = getZoneByType(current.zones, playerId, ZONE.HAND);
        if (!currentLibrary || !currentHand) return {};

        const nextCards = { ...current.cards };
        const nextZones = { ...current.zones };

        const localKeeps =
          nextZones[currentLibrary.id]?.cardIds.filter((id) => {
            const card = nextCards[id];
            return card && card.ownerId !== playerId;
          }) ?? [];
        localKeeps.forEach((id) => {
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
        const ownedCards = Object.values(current.cards).filter(
          (card) => card.ownerId === playerId
        );
        ownedCards.forEach((card) => {
          const fromZone = nextZones[card.zoneId];
          if (
            fromZone &&
            fromZone.ownerId === playerId &&
            isCommanderZoneType(fromZone.type)
          ) {
            return;
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
            zoneId: currentLibrary.id,
            tapped: false,
            faceDown: false,
            controllerId: card.ownerId,
            knownToAll: false,
            revealedToAll: false,
            revealedTo: [],
            position: { x: 0, y: 0 },
            rotation: 0,
            customText: undefined,
            counters: enforceZoneCounterRules(resetCard.counters, currentLibrary),
          };
          toLibrary.push(card.id);
        });

        const shuffled = [...localKeeps, ...toLibrary].sort(
          () => Math.random() - 0.5
        );
        const drawIds = drawCount > 0 ? shuffled.slice(-drawCount) : [];
        localDrawCount = drawIds.length;

        const remainingLibrary = shuffled.slice(0, shuffled.length - drawIds.length);
        nextZones[currentLibrary.id] = {
          ...nextZones[currentLibrary.id],
          cardIds: remainingLibrary,
        };

        if (drawIds.length > 0) {
          const nextHandIds = [...(nextZones[currentHand.id]?.cardIds ?? [])];
          drawIds.forEach((id) => {
            nextHandIds.push(id);
            const card = nextCards[id];
            if (!card) return;
            nextCards[id] = {
              ...card,
              zoneId: currentHand.id,
              tapped: false,
              faceDown: false,
              controllerId: card.ownerId,
              counters: enforceZoneCounterRules(card.counters, currentHand),
            };
          });
          nextZones[currentHand.id] = {
            ...nextZones[currentHand.id],
            cardIds: nextHandIds,
          };
        }

        return { cards: nextCards, zones: nextZones };
      });
    }

    logPermission({
      action: "mulligan",
      actorId: actor,
      allowed: true,
      details: { playerId },
    });
    emitLog("deck.reset", { actorId: actor, playerId }, buildLogContext());

    const logDrawCount = sharedApplied
      ? sharedDrawCount || estimatedDrawCount
      : localDrawCount;
    if (logDrawCount > 0) {
      emitLog(
        "card.draw",
        { actorId: actor, playerId, count: logDrawCount },
        buildLogContext()
      );
    }
  };
