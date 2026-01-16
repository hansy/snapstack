import type { StoreApi } from "zustand";

import type { GameState } from "@/types";
import type { DispatchIntent } from "@/store/gameStore/dispatchIntent";

import { canModifyCardState } from "@/rules/permissions";
import { logPermission } from "@/rules/logger";
import {
  decrementCounter,
  isBattlefieldZone,
  mergeCounters,
  resolveCounterColor,
} from "@/lib/counters";

type SetState = StoreApi<GameState>["setState"];
type GetState = StoreApi<GameState>["getState"];

type Deps = {
  dispatchIntent: DispatchIntent;
};

export const createCounterActions = (
  _set: SetState,
  get: GetState,
  { dispatchIntent }: Deps
): Pick<
  GameState,
  "addGlobalCounter" | "addCounterToCard" | "removeCounterFromCard"
> => ({
  addGlobalCounter: (name: string, color?: string, _isRemote?: boolean) => {
    if (get().viewerRole === "spectator") return;
    const normalizedName = name.trim().slice(0, 64);
    if (!normalizedName) return;

    const existing = get().globalCounters[normalizedName];
    if (existing) return;

    const resolvedColor = resolveCounterColor(normalizedName, get().globalCounters);
    const normalizedColor = (color || resolvedColor).slice(0, 16);

    dispatchIntent({
      type: "counter.global.add",
      payload: {
        counterType: normalizedName,
        color: normalizedColor,
        actorId: get().myPlayerId,
      },
      applyLocal: (state) => {
        return {
          globalCounters: { ...state.globalCounters, [normalizedName]: normalizedColor },
        };
      },
      isRemote: _isRemote,
    });

  },

  addCounterToCard: (cardId, counter, actorId, _isRemote) => {
    const state = get();
    const card = state.cards[cardId];
    if (!card) return;

    const actor = actorId ?? state.myPlayerId;
    const role = actor === state.myPlayerId ? state.viewerRole : "player";
    const zone = state.zones[card.zoneId];
    if (!isBattlefieldZone(zone)) return;

    const permission = canModifyCardState({ actorId: actor, role }, card, zone);
    if (!permission.allowed) {
      logPermission({
        action: "addCounterToCard",
        actorId: actor,
        allowed: false,
        reason: permission.reason,
        details: { cardId, zoneId: card.zoneId, counterType: counter.type },
      });
      return;
    }

    const prevCount = card.counters.find((c) => c.type === counter.type)?.count ?? 0;
    const newCounters = mergeCounters(card.counters, counter);
    const nextCount =
      newCounters.find((c) => c.type === counter.type)?.count ?? prevCount;
    const delta = nextCount - prevCount;
    if (delta <= 0) return;

    dispatchIntent({
      type: "card.counter.adjust",
      payload: { cardId, counter, actorId: actor },
      applyLocal: (current) => {
        const currentCard = current.cards[cardId];
        if (!currentCard) return current;
        return {
          cards: {
            ...current.cards,
            [cardId]: {
              ...currentCard,
              counters: newCounters,
            },
          },
        };
      },
      isRemote: _isRemote,
    });

    logPermission({
      action: "addCounterToCard",
      actorId: actor,
      allowed: true,
      details: { cardId, zoneId: card.zoneId, counterType: counter.type, delta },
    });
  },

  removeCounterFromCard: (cardId, counterType, actorId, _isRemote) => {
    const state = get();
    const card = state.cards[cardId];
    if (!card) return;

    const actor = actorId ?? state.myPlayerId;
    const role = actor === state.myPlayerId ? state.viewerRole : "player";
    const zone = state.zones[card.zoneId];
    if (!isBattlefieldZone(zone)) return;

    const permission = canModifyCardState({ actorId: actor, role }, card, zone);
    if (!permission.allowed) {
      logPermission({
        action: "removeCounterFromCard",
        actorId: actor,
        allowed: false,
        reason: permission.reason,
        details: { cardId, zoneId: card.zoneId, counterType },
      });
      return;
    }

    const prevCount = card.counters.find((c) => c.type === counterType)?.count ?? 0;
    const newCounters = decrementCounter(card.counters, counterType);
    const nextCount = newCounters.find((c) => c.type === counterType)?.count ?? 0;
    const delta = nextCount - prevCount;
    if (delta === 0) return;

    dispatchIntent({
      type: "card.counter.adjust",
      payload: { cardId, counterType, actorId: actor, delta },
      applyLocal: (current) => {
        const currentCard = current.cards[cardId];
        if (!currentCard) return current;
        return {
          cards: {
            ...current.cards,
            [cardId]: {
              ...currentCard,
              counters: newCounters,
            },
          },
        };
      },
      isRemote: _isRemote,
    });

    logPermission({
      action: "removeCounterFromCard",
      actorId: actor,
      allowed: true,
      details: { cardId, zoneId: card.zoneId, counterType, delta },
    });
  },
});
