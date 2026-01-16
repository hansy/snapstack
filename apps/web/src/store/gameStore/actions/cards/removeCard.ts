import type { GameState } from "@/types";

import { logPermission } from "@/rules/logger";
import type { Deps, GetState, SetState } from "./types";

export const createRemoveCard =
  (
    _set: SetState,
    get: GetState,
    { dispatchIntent }: Deps
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

    dispatchIntent({
      type: "card.remove",
      payload: { cardId, actorId: actor },
      applyLocal: (state) => {
        const nextCards = { ...state.cards };
        delete nextCards[cardId];

        const nextZones = {
          ...state.zones,
          [zone.id]: { ...zone, cardIds: zone.cardIds.filter((id) => id !== cardId) },
        };

        return { cards: nextCards, zones: nextZones };
      },
      isRemote: _isRemote,
    });

    logPermission({ action: "removeCard", actorId: actor, allowed: true, details: { cardId } });
  };
