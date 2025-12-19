import { normalizeUsernameInput } from "@/store/clientPrefsStore";
import type { SharedMaps } from "@/yjs/yMutations";
import { patchPlayer, sharedSnapshot, upsertPlayer, upsertZone } from "@/yjs/yMutations";

import { applyLocalPlayerInitPlan } from "./applyLocalPlayerInitPlan";
import { computeLocalPlayerInitPlan } from "./localPlayerInitPlan";

export const getDefaultPlayerName = (playerId: string) =>
  `Player ${playerId.slice(0, 4).toUpperCase()}`;

export const resolveDesiredPlayerName = (username: string | null | undefined, defaultName: string) =>
  normalizeUsernameInput(username) ?? defaultName;

export const ensureLocalPlayerInitialized = (params: {
  transact: (fn: () => void) => void;
  sharedMaps: SharedMaps;
  playerId: string;
  preferredUsername?: string | null;
}) => {
  const snapshot = sharedSnapshot(params.sharedMaps);
  const defaultName = getDefaultPlayerName(params.playerId);
  const desiredName = resolveDesiredPlayerName(params.preferredUsername, defaultName);

  const plan = computeLocalPlayerInitPlan({
    players: snapshot.players,
    playerOrder: snapshot.playerOrder ?? [],
    zones: snapshot.zones,
    playerId: params.playerId,
    desiredName,
    defaultName,
  });

  if (!plan) return;

  applyLocalPlayerInitPlan({
    transact: params.transact,
    sharedMaps: params.sharedMaps,
    playerId: params.playerId,
    plan,
    mutations: { upsertPlayer, patchPlayer, upsertZone },
  });
};

