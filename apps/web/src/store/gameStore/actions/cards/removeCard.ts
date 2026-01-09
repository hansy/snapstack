import type { GameState } from "@/types";

import { logPermission } from "@/rules/logger";
import { emitLog } from "@/logging/logStore";
import { removeCard as yRemoveCard } from "@/yjs/yMutations";
import type { Deps, GetState, SetState } from "./types";
import { useCommandLog } from "@/lib/featureFlags";
import { enqueueLocalCommand, getActiveCommandLog } from "@/commandLog";

export const createRemoveCard =
  (
    set: SetState,
    get: GetState,
    { applyShared, buildLogContext }: Deps
  ): GameState["removeCard"] =>
  (cardId, actorId, _isRemote) => {
    const actor = actorId ?? get().myPlayerId;
    const role = actor === get().myPlayerId ? get().viewerRole : "player";
    const snapshot = get();
    const card = snapshot.cards[cardId];
    if (!card) return;

    const zone = snapshot.zones[card.zoneId];
    if (!zone) return;

    if (role === "spectator") {
      logPermission({
        action: "removeCard",
        actorId: actor,
        allowed: false,
        reason: "Spectators cannot remove cards",
        details: { cardId },
      });
      return;
    }

    if (!card.isToken) {
      logPermission({
        action: "removeCard",
        actorId: actor,
        allowed: false,
        reason: "Direct remove is allowed only for tokens",
        details: { cardId },
      });
      return;
    }

    const actorIsOwner = actor === card.ownerId;
    const actorIsZoneHost = actor === zone.ownerId;
    const actorIsController = actor === card.controllerId;
    if (!actorIsOwner && !actorIsZoneHost && !actorIsController) {
      logPermission({
        action: "removeCard",
        actorId: actor,
        allowed: false,
        reason: "Only owner, controller, or zone host may remove this token",
        details: { cardId },
      });
      return;
    }

    emitLog(
      "card.remove",
      { actorId: actor, cardId, zoneId: zone.id, cardName: card.name },
      buildLogContext()
    );

    if (useCommandLog) {
      const active = getActiveCommandLog();
      if (active) {
        enqueueLocalCommand({
          sessionId: active.sessionId,
          commands: active.commands,
          type: "card.remove.public",
          buildPayloads: () => ({
            payloadPublic: { cardId, zoneId: card.zoneId },
          }),
        });
        return;
      }
    }

    if (applyShared((maps) => yRemoveCard(maps, cardId))) return;

    set((state) => {
      const nextCards = { ...state.cards };
      delete nextCards[cardId];

      const nextZones = {
        ...state.zones,
        [zone.id]: { ...zone, cardIds: zone.cardIds.filter((id) => id !== cardId) },
      };

      return { cards: nextCards, zones: nextZones };
    });

    logPermission({ action: "removeCard", actorId: actor, allowed: true, details: { cardId } });
  };
