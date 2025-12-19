import type { StoreApi } from "zustand";

import type { GameState } from "@/types";
import type { SharedMaps } from "@/yjs/yMutations";
import type { LogContext } from "@/logging/types";

import { canModifyCardState } from "@/rules/permissions";
import { logPermission } from "@/rules/logger";
import {
  decrementCounter,
  isBattlefieldZone,
  mergeCounters,
  resolveCounterColor,
} from "@/lib/counters";
import { emitLog } from "@/logging/logStore";
import {
  addCounterToCard as yAddCounterToCard,
  removeCounterFromCard as yRemoveCounterFromCard,
} from "@/yjs/yMutations";

type SetState = StoreApi<GameState>["setState"];
type GetState = StoreApi<GameState>["getState"];

type ApplyShared = (fn: (maps: SharedMaps) => void) => boolean;

type Deps = {
  applyShared: ApplyShared;
  buildLogContext: () => LogContext;
};

export const createCounterActions = (
  set: SetState,
  get: GetState,
  { applyShared, buildLogContext }: Deps
): Pick<
  GameState,
  "addGlobalCounter" | "addCounterToCard" | "removeCounterFromCard"
> => ({
  addGlobalCounter: (name: string, color?: string, _isRemote?: boolean) => {
    const normalizedName = name.trim().slice(0, 64);
    if (!normalizedName) return;

    const existing = get().globalCounters[normalizedName];
    if (existing) return;

    const resolvedColor = resolveCounterColor(normalizedName, get().globalCounters);
    const normalizedColor = (color || resolvedColor).slice(0, 16);

    if (
      applyShared((maps) => {
        const current = maps.globalCounters.get(normalizedName) as
          | string
          | undefined;
        if (current) return;
        maps.globalCounters.set(normalizedName, normalizedColor);
      })
    )
      return;

    set((state) => ({
      globalCounters: { ...state.globalCounters, [normalizedName]: normalizedColor },
    }));

    emitLog(
      "counter.global.add",
      { counterType: normalizedName, color: normalizedColor },
      buildLogContext()
    );
  },

  addCounterToCard: (cardId, counter, actorId, _isRemote) => {
    const state = get();
    const card = state.cards[cardId];
    if (!card) return;

    const actor = actorId ?? state.myPlayerId;
    const zone = state.zones[card.zoneId];
    if (!isBattlefieldZone(zone)) return;

    const permission = canModifyCardState({ actorId: actor }, card, zone);
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

    if (applyShared((maps) => yAddCounterToCard(maps, cardId, counter))) return;

    set((current) => {
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
    });

    logPermission({
      action: "addCounterToCard",
      actorId: actor,
      allowed: true,
      details: { cardId, zoneId: card.zoneId, counterType: counter.type, delta },
    });
    emitLog(
      "counter.add",
      {
        actorId: actor,
        cardId,
        zoneId: card.zoneId,
        counterType: counter.type,
        delta,
        newTotal: nextCount,
        cardName: card.name,
      },
      buildLogContext()
    );
  },

  removeCounterFromCard: (cardId, counterType, actorId, _isRemote) => {
    const state = get();
    const card = state.cards[cardId];
    if (!card) return;

    const actor = actorId ?? state.myPlayerId;
    const zone = state.zones[card.zoneId];
    if (!isBattlefieldZone(zone)) return;

    const permission = canModifyCardState({ actorId: actor }, card, zone);
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

    if (applyShared((maps) => yRemoveCounterFromCard(maps, cardId, counterType)))
      return;

    set((current) => {
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
    });

    logPermission({
      action: "removeCounterFromCard",
      actorId: actor,
      allowed: true,
      details: { cardId, zoneId: card.zoneId, counterType, delta },
    });
    emitLog(
      "counter.remove",
      {
        actorId: actor,
        cardId,
        zoneId: card.zoneId,
        counterType,
        delta,
        newTotal: nextCount,
        cardName: card.name,
      },
      buildLogContext()
    );
  },
});

