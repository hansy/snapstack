import type { Player, Zone } from "@/types";
import type { SharedMaps } from "@/yjs/yMutations";

import type { LocalPlayerInitPlan } from "./localPlayerInitPlan";

export type TransactLike = (fn: () => void) => void;

export type LocalPlayerInitMutations = {
  upsertPlayer: (maps: SharedMaps, player: Player) => void;
  patchPlayer: (maps: SharedMaps, playerId: string, patch: Partial<Player>) => void;
  upsertZone: (maps: SharedMaps, zone: Zone) => void;
};

export const applyLocalPlayerInitPlan = (params: {
  transact: TransactLike;
  sharedMaps: SharedMaps;
  playerId: string;
  plan: LocalPlayerInitPlan;
  mutations: LocalPlayerInitMutations;
}) => {
  params.transact(() => {
    if (params.plan.upsertPlayer) {
      params.mutations.upsertPlayer(params.sharedMaps, params.plan.upsertPlayer);
    } else if (params.plan.patchLocalPlayer) {
      params.mutations.patchPlayer(params.sharedMaps, params.playerId, params.plan.patchLocalPlayer);
    }

    params.plan.patchColors.forEach(({ playerId, color }) => {
      params.mutations.patchPlayer(params.sharedMaps, playerId, { color });
    });

    params.plan.zonesToCreate.forEach((zone) => {
      params.mutations.upsertZone(params.sharedMaps, zone);
    });
  });
};

