import type { GameState } from "@/types";

import type { LocalPlayerInitPlan } from "./localPlayerInitPlan";

export type LocalPlayerInitActions = Pick<
  GameState,
  "addPlayer" | "updatePlayer" | "addZone"
>;

export const applyLocalPlayerInitPlan = (params: {
  playerId: string;
  plan: LocalPlayerInitPlan;
  actions: LocalPlayerInitActions;
}) => {
  if (params.plan.upsertPlayer) {
    params.actions.addPlayer(params.plan.upsertPlayer);
  } else if (params.plan.patchLocalPlayer) {
    params.actions.updatePlayer(
      params.playerId,
      params.plan.patchLocalPlayer,
      params.playerId
    );
  }

  params.plan.patchColors.forEach(({ playerId, color }) => {
    params.actions.updatePlayer(playerId, { color }, params.playerId);
  });

  params.plan.zonesToCreate.forEach((zone) => {
    params.actions.addZone(zone);
  });
};
