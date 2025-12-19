import type { StoreApi } from "zustand";

import type { GameState } from "@/types";
import type { SharedMaps } from "@/yjs/yMutations";

import { canUpdatePlayer } from "@/rules/permissions";
import { logPermission } from "@/rules/logger";
import { emitLog } from "@/logging/logStore";
import { patchPlayer as yPatchPlayer, upsertPlayer as yUpsertPlayer } from "@/yjs/yMutations";
import type { LogContext } from "@/logging/types";

type SetState = StoreApi<GameState>["setState"];
type GetState = StoreApi<GameState>["getState"];

type ApplyShared = (fn: (maps: SharedMaps) => void) => boolean;

type Deps = {
  applyShared: ApplyShared;
  buildLogContext: () => LogContext;
};

export const createPlayerActions = (
  set: SetState,
  get: GetState,
  { applyShared, buildLogContext }: Deps
): Pick<
  GameState,
  "addPlayer" | "updatePlayer" | "updateCommanderTax" | "setDeckLoaded"
> => ({
  addPlayer: (player, _isRemote) => {
    const normalized = { ...player, deckLoaded: false, commanderTax: 0 };
    if (applyShared((maps) => yUpsertPlayer(maps, normalized))) return;
    set((state) => ({
      players: { ...state.players, [normalized.id]: normalized },
      playerOrder: state.playerOrder.includes(normalized.id)
        ? state.playerOrder
        : [...state.playerOrder, normalized.id],
    }));
  },

  updatePlayer: (id, updates, actorId, _isRemote) => {
    const actor = actorId ?? get().myPlayerId;
    const player = get().players[id];
    if (!player) return;

    const permission = canUpdatePlayer({ actorId: actor }, player, updates);
    if (!permission.allowed) {
      logPermission({
        action: "updatePlayer",
        actorId: actor,
        allowed: false,
        reason: permission.reason,
        details: { playerId: id, updates },
      });
      return;
    }
    logPermission({
      action: "updatePlayer",
      actorId: actor,
      allowed: true,
      details: { playerId: id, updates },
    });

    if (typeof updates.life === "number" && updates.life !== player.life) {
      emitLog(
        "player.life",
        {
          actorId: actor,
          playerId: id,
          from: player.life,
          to: updates.life,
          delta: updates.life - player.life,
        },
        buildLogContext()
      );
    }

    if (
      applyShared((maps) => {
        yPatchPlayer(maps, id, updates);
      })
    )
      return;

    set((state) => ({
      players: {
        ...state.players,
        [id]: { ...state.players[id], ...updates },
      },
    }));
  },

  updateCommanderTax: (playerId, delta, actorId, _isRemote) => {
    const actor = actorId ?? get().myPlayerId;
    const player = get().players[playerId];
    if (!player) return;
    if (actor !== playerId) {
      logPermission({
        action: "updateCommanderTax",
        actorId: actor,
        allowed: false,
        reason: "Only the player may change their commander tax",
        details: { playerId, delta },
      });
      return;
    }

    const from = player.commanderTax || 0;
    const to = Math.max(0, from + delta);

    if (
      applyShared((maps) => {
        yPatchPlayer(maps, playerId, { commanderTax: to });
      })
    )
      return;

    set((state) => {
      const current = state.players[playerId];
      if (!current) return state;
      return {
        players: {
          ...state.players,
          [playerId]: { ...current, commanderTax: to },
        },
      };
    });

    logPermission({
      action: "updateCommanderTax",
      actorId: actor,
      allowed: true,
      details: { playerId, delta },
    });
    emitLog(
      "player.commanderTax",
      { actorId: actor, playerId, from, to, delta: to - from },
      buildLogContext()
    );
  },

  setDeckLoaded: (playerId, loaded, _isRemote) => {
    if (
      applyShared((maps) => {
        yPatchPlayer(maps, playerId, { deckLoaded: loaded });
      })
    )
      return;

    set((state) => ({
      players: {
        ...state.players,
        [playerId]: { ...state.players[playerId], deckLoaded: loaded },
      },
    }));
  },
});
