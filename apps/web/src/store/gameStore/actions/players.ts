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
  "addPlayer" | "updatePlayer" | "setDeckLoaded"
> => ({
  addPlayer: (player, _isRemote) => {
    if (get().viewerRole === "spectator") return;
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
    const role = actor === get().myPlayerId ? get().viewerRole : "player";
    const player = get().players[id];
    if (!player) return;

    const permission = canUpdatePlayer({ actorId: actor, role }, player, updates);
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
      "libraryTopReveal" in updates &&
      updates.libraryTopReveal !== player.libraryTopReveal
    ) {
      const enabled = Boolean(updates.libraryTopReveal);
      const mode = enabled ? updates.libraryTopReveal : player.libraryTopReveal;
      if (mode) {
        emitLog(
          "library.topReveal",
          { actorId: actor, playerId: id, enabled, mode },
          buildLogContext()
        );
      }
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

  setDeckLoaded: (playerId, loaded, _isRemote) => {
    if (get().viewerRole === "spectator") return;
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
