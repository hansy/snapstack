import type { Card, GameState } from "@/types";

import { ZONE } from "@/constants/zones";
import { canModifyCardState } from "@/rules/permissions";
import { logPermission } from "@/rules/logger";
import { emitLog } from "@/logging/logStore";
import { enforceZoneCounterRules } from "@/lib/counters";
import { patchCard as yPatchCard } from "@/yjs/yMutations";
import { syncCommanderDecklistForPlayer } from "@/store/gameStore/actions/deck/commanderDecklist";
import { buildUpdateCardPatch } from "../cardsModel";
import type { Deps, GetState, SetState } from "./types";

export const createUpdateCard =
  (
    set: SetState,
    get: GetState,
    { applyShared, buildLogContext }: Deps
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
      const newPower = updates.power ?? cardBefore.power;
      const newToughness = updates.toughness ?? cardBefore.toughness;
      const powerChanged = newPower !== cardBefore.power;
      const toughnessChanged = newToughness !== cardBefore.toughness;
      if (
        (powerChanged || toughnessChanged) &&
        (newPower !== undefined || newToughness !== undefined)
      ) {
        emitLog(
          "card.pt",
          {
            actorId: actor,
            cardId: id,
            zoneId: cardBefore.zoneId,
            fromPower: cardBefore.power,
            fromToughness: cardBefore.toughness,
            toPower: newPower ?? cardBefore.power,
            toToughness: newToughness ?? cardBefore.toughness,
            cardName: cardBefore.name,
          },
          buildLogContext()
        );
      }
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

    const commanderTaxLog = (() => {
      if (!cardBefore || !isCommanderTaxUpdate) return null;
      const { next } = buildUpdateCardPatch(cardBefore, updates);
      const from = cardBefore.commanderTax ?? 0;
      const to = next.commanderTax ?? 0;
      const delta = to - from;
      if (delta === 0) return null;
      return { from, to, delta };
    })();

    if (commanderTaxLog && cardBefore) {
      emitLog(
        "player.commanderTax",
        {
          actorId: actor,
          playerId: cardBefore.ownerId,
          cardId: cardBefore.id,
          zoneId: cardBefore.zoneId,
          cardName: cardBefore.name,
          from: commanderTaxLog.from,
          to: commanderTaxLog.to,
          delta: commanderTaxLog.delta,
        },
        buildLogContext()
      );
    }

    const zoneTypeBefore = cardBefore
      ? get().zones[cardBefore.zoneId]?.type
      : undefined;
    const shouldMarkKnownAfterFaceUp =
      cardBefore &&
      updates.faceDown === false &&
      cardBefore.faceDown === true &&
      zoneTypeBefore === ZONE.BATTLEFIELD;
    const shouldHideAfterFaceDown =
      cardBefore &&
      updates.faceDown === true &&
      cardBefore.faceDown === false &&
      zoneTypeBefore === ZONE.BATTLEFIELD;

    const sharedApplied = applyShared((maps) => {
      if (!cardBefore) return;
      const { patch } = buildUpdateCardPatch(cardBefore, updates);
      if (shouldMarkKnownAfterFaceUp) patch.knownToAll = true;
      if (shouldHideAfterFaceDown) {
        patch.knownToAll = false;
        patch.revealedToAll = false;
        patch.revealedTo = [];
      }
      if (Object.keys(patch).length > 0) {
        yPatchCard(maps, id, patch);
      }
    });

    if (sharedApplied) {
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
      return;
    }

    set((state) => {
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
