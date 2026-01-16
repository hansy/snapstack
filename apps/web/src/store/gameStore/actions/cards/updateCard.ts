import type { Card, GameState } from "@/types";

import { ZONE } from "@/constants/zones";
import { canModifyCardState } from "@/rules/permissions";
import { logPermission } from "@/rules/logger";
import { enforceZoneCounterRules } from "@/lib/counters";
import { syncCommanderDecklistForPlayer } from "@/store/gameStore/actions/deck/commanderDecklist";
import { buildUpdateCardPatch } from "../cardsModel";
import type { Deps, GetState, SetState } from "./types";

export const createUpdateCard =
  (
    _set: SetState,
    get: GetState,
    { dispatchIntent }: Deps
  ): GameState["updateCard"] =>
  (id, updates, actorId, _isRemote) => {
    const actor = actorId ?? get().myPlayerId;
    const role = actor === get().myPlayerId ? get().viewerRole : "player";
    if (role === "spectator") return;
    const cardBefore = get().cards[id];
    const isCommanderUpdate = Object.prototype.hasOwnProperty.call(updates, "isCommander");
    const isCommanderTaxUpdate = Object.prototype.hasOwnProperty.call(updates, "commanderTax");
    const shouldSyncCommander =
      isCommanderUpdate && cardBefore?.ownerId === actor && actor === get().myPlayerId;

    if (
      Object.prototype.hasOwnProperty.call(updates, "zoneId") ||
      Object.prototype.hasOwnProperty.call(updates, "position") ||
      Object.prototype.hasOwnProperty.call(updates, "counters")
    ) {
      console.warn(
        "[updateCard] Unsupported fields (use moveCard / addCounterToCard instead)",
        {
          cardId: id,
          fields: Object.keys(updates),
        }
      );
      return;
    }

    if (cardBefore) {
      if (isCommanderUpdate && cardBefore.ownerId !== actor) {
        logPermission({
          action: "updateCard",
          actorId: actor,
          allowed: false,
          reason: "Only owner may update commander status",
          details: { cardId: id, zoneId: cardBefore.zoneId, updates: ["isCommander"] },
        });
        return;
      }
      if (isCommanderTaxUpdate && cardBefore.ownerId !== actor) {
        logPermission({
          action: "updateCard",
          actorId: actor,
          allowed: false,
          reason: "Only owner may update commander tax",
          details: { cardId: id, zoneId: cardBefore.zoneId, updates: ["commanderTax"] },
        });
        return;
      }

      const cardZone = get().zones[cardBefore.zoneId];
      const controlledFields: Array<keyof Card> = [
        "power",
        "toughness",
        "basePower",
        "baseToughness",
        "customText",
        "faceDown",
        "faceDownMode",
        "currentFaceIndex",
      ];
      const requiresControl = Object.keys(updates).some((key) =>
        controlledFields.includes(key as keyof Card)
      );
      if (requiresControl) {
        const permission = canModifyCardState(
          { actorId: actor, role },
          cardBefore,
          cardZone
        );
        if (!permission.allowed) {
          logPermission({
            action: "updateCard",
            actorId: actor,
            allowed: false,
            reason: permission.reason,
            details: {
              cardId: id,
              zoneId: cardBefore.zoneId,
              updates: Object.keys(updates),
            },
          });
          return;
        }
      }
    }

    dispatchIntent({
      type: "card.update",
      payload: { cardId: id, updates, actorId: actor },
      applyLocal: (state) => {
        const current = state.cards[id];
        if (!current) return state;

        const zone = state.zones[current.zoneId];
        const { next } = buildUpdateCardPatch(current, updates);
        const shouldMarkKnownAfterFaceUp =
          updates.faceDown === false &&
          current.faceDown === true &&
          zone?.type === ZONE.BATTLEFIELD;
        const shouldHideAfterFaceDown =
          updates.faceDown === true &&
          current.faceDown === false &&
          zone?.type === ZONE.BATTLEFIELD;
        const nextWithVisibility = shouldHideAfterFaceDown
          ? {
              ...next,
              knownToAll: false,
              revealedToAll: false,
              revealedTo: [],
            }
          : shouldMarkKnownAfterFaceUp
            ? { ...next, knownToAll: true }
            : next;

        return {
          cards: {
            ...state.cards,
            [id]: {
              ...nextWithVisibility,
              counters: enforceZoneCounterRules(nextWithVisibility.counters, zone),
            },
          },
        };
      },
      isRemote: _isRemote,
    });

    if (shouldSyncCommander && cardBefore) {
      syncCommanderDecklistForPlayer({
        state: get(),
        playerId: actor,
        override: {
          cardId: id,
          isCommander: updates.isCommander === true,
          name: cardBefore.name,
          ownerId: cardBefore.ownerId,
        },
      });
    }
  };
