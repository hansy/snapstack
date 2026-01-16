import { normalizeUsernameInput } from "@/store/clientPrefsStore";
import { MAX_PLAYERS } from "@/lib/room";
import type { GameState } from "@/types";

import { applyLocalPlayerInitPlan, type LocalPlayerInitActions } from "./applyLocalPlayerInitPlan";
import { computeLocalPlayerInitPlan } from "./localPlayerInitPlan";

export const getDefaultPlayerName = (playerId: string) =>
  `Player ${playerId.slice(0, 4).toUpperCase()}`;

export const resolveDesiredPlayerName = (username: string | null | undefined, defaultName: string) =>
  normalizeUsernameInput(username) ?? defaultName;

export type LocalPlayerInitResult =
  | { status: "blocked"; reason: "full" | "locked" | "overCapacity" }
  | null;

export const ensureLocalPlayerInitialized = (params: {
  state: Pick<
    GameState,
    "players" | "playerOrder" | "zones" | "roomLockedByHost" | "roomOverCapacity"
  >;
  actions: LocalPlayerInitActions;
  playerId: string;
  preferredUsername?: string | null;
}): LocalPlayerInitResult => {
  const defaultName = getDefaultPlayerName(params.playerId);
  const desiredName = resolveDesiredPlayerName(params.preferredUsername, defaultName);

  const playerExists = Boolean(params.state.players[params.playerId]);
  const playerCount = Object.keys(params.state.players).length;
  const roomIsFull = playerCount >= MAX_PLAYERS;
  const roomOverCapacity = params.state.roomOverCapacity || playerCount > MAX_PLAYERS;
  const roomLockedByHost = params.state.roomLockedByHost;
  const roomIsLocked = roomLockedByHost || roomIsFull;

  if (!playerExists && roomIsLocked) {
    if (roomOverCapacity) {
      return { status: "blocked", reason: "overCapacity" };
    }
    return { status: "blocked", reason: roomIsFull ? "full" : "locked" };
  }

  const plan = computeLocalPlayerInitPlan({
    players: params.state.players,
    playerOrder: params.state.playerOrder ?? [],
    zones: params.state.zones,
    playerId: params.playerId,
    desiredName,
    defaultName,
  });

  if (plan) {
    applyLocalPlayerInitPlan({
      playerId: params.playerId,
      plan,
      actions: params.actions,
    });
  }

  return null;
};
