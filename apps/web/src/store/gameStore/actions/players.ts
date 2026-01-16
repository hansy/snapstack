import type { StoreApi } from "zustand";

import type { GameState } from "@/types";
import type { DispatchIntent } from "@/store/gameStore/dispatchIntent";
import { MAX_PLAYER_LIFE, MIN_PLAYER_LIFE } from "@/lib/limits";

import { canUpdatePlayer } from "@/rules/permissions";
import { logPermission } from "@/rules/logger";

type SetState = StoreApi<GameState>["setState"];
type GetState = StoreApi<GameState>["getState"];

type Deps = {
  dispatchIntent: DispatchIntent;
};

const clampLife = (life: number) =>
  Math.min(MAX_PLAYER_LIFE, Math.max(MIN_PLAYER_LIFE, life));

export const createPlayerActions = (
  _set: SetState,
  get: GetState,
  { dispatchIntent }: Deps
): Pick<
  GameState,
  "addPlayer" | "updatePlayer" | "setDeckLoaded"
> => ({
  addPlayer: (player, _isRemote) => {
    if (get().viewerRole === "spectator") return;
    const normalized = { ...player, deckLoaded: false, commanderTax: 0 };
    dispatchIntent({
      type: "player.join",
      payload: { player: normalized },
      applyLocal: (state) => ({
        players: { ...state.players, [normalized.id]: normalized },
        playerOrder: state.playerOrder.includes(normalized.id)
          ? state.playerOrder
          : [...state.playerOrder, normalized.id],
      }),
      isRemote: _isRemote,
    });
  },

  updatePlayer: (id, updates, actorId, _isRemote) => {
    const actor = actorId ?? get().myPlayerId;
    const role = actor === get().myPlayerId ? get().viewerRole : "player";
    const player = get().players[id];
    if (!player) return;

    const normalizedUpdates = { ...updates };
    if ("life" in normalizedUpdates) {
      const nextLife = normalizedUpdates.life;
      if (typeof nextLife !== "number" || !Number.isFinite(nextLife)) {
        delete normalizedUpdates.life;
      } else {
        normalizedUpdates.life = clampLife(nextLife);
      }
    }

    const permission = canUpdatePlayer(
      { actorId: actor, role },
      player,
      normalizedUpdates
    );
    if (!permission.allowed) {
      logPermission({
        action: "updatePlayer",
        actorId: actor,
        allowed: false,
        reason: permission.reason,
        details: { playerId: id, updates: normalizedUpdates },
      });
      return;
    }
    logPermission({
      action: "updatePlayer",
      actorId: actor,
      allowed: true,
      details: { playerId: id, updates: normalizedUpdates },
    });

    dispatchIntent({
      type: "player.update",
      payload: { playerId: id, updates: normalizedUpdates, actorId: actor },
      applyLocal: (state) => ({
        players: {
          ...state.players,
          [id]: { ...state.players[id], ...normalizedUpdates },
        },
      }),
      isRemote: _isRemote,
    });
  },

  setDeckLoaded: (playerId, loaded, _isRemote) => {
    if (get().viewerRole === "spectator") return;
    dispatchIntent({
      type: loaded ? "deck.load" : "deck.unload",
      payload: { playerId },
      applyLocal: (state) => ({
        players: {
          ...state.players,
          [playerId]: { ...state.players[playerId], deckLoaded: loaded },
        },
      }),
      isRemote: _isRemote,
    });
  },
});
