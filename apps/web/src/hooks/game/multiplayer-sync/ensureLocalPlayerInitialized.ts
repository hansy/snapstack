import { normalizeUsernameInput } from "@/store/clientPrefsStore";
import { MAX_ROOM_PLAYERS } from "@/lib/room";
import type { SharedMaps } from "@/yjs/yMutations";
import { patchPlayer, patchRoomMeta, sharedSnapshot, upsertPlayer, upsertZone } from "@/yjs/yMutations";

import { applyLocalPlayerInitPlan } from "./applyLocalPlayerInitPlan";
import { computeLocalPlayerInitPlan } from "./localPlayerInitPlan";

export const getDefaultPlayerName = (playerId: string) =>
  `Player ${playerId.slice(0, 4).toUpperCase()}`;

export const resolveDesiredPlayerName = (username: string | null | undefined, defaultName: string) =>
  normalizeUsernameInput(username) ?? defaultName;

const resolveHostId = (players: Record<string, unknown>, playerOrder: string[]): string | null => {
  for (const id of playerOrder) {
    if (players[id]) return id;
  }
  const fallback = Object.keys(players).sort()[0];
  return fallback ?? null;
};

export type LocalPlayerInitResult =
  | { status: "blocked"; reason: "full" | "locked" | "overCapacity" }
  | null;

export const ensureLocalPlayerInitialized = (params: {
  transact: (fn: () => void) => void;
  sharedMaps: SharedMaps;
  playerId: string;
  preferredUsername?: string | null;
}): LocalPlayerInitResult => {
  const snapshot = sharedSnapshot(params.sharedMaps);
  const defaultName = getDefaultPlayerName(params.playerId);
  const desiredName = resolveDesiredPlayerName(params.preferredUsername, defaultName);

  const playerExists = Boolean(snapshot.players[params.playerId]);
  const playerCount = Object.keys(snapshot.players).length;
  const roomIsFull = playerCount >= MAX_ROOM_PLAYERS;
  const roomOverCapacity = playerCount > MAX_ROOM_PLAYERS;
  const rawMeta = snapshot.meta ?? {};
  const roomLockedByHost = rawMeta.locked === true;
  const roomIsLocked = roomLockedByHost || roomIsFull;

  if (!playerExists && roomIsLocked) {
    if (roomOverCapacity) {
      return { status: "blocked", reason: "overCapacity" };
    }
    return { status: "blocked", reason: roomIsFull ? "full" : "locked" };
  }

  const plan = computeLocalPlayerInitPlan({
    players: snapshot.players,
    playerOrder: snapshot.playerOrder ?? [],
    zones: snapshot.zones,
    playerId: params.playerId,
    desiredName,
    defaultName,
  });

  if (plan) {
    applyLocalPlayerInitPlan({
      transact: params.transact,
      sharedMaps: params.sharedMaps,
      playerId: params.playerId,
      plan,
      mutations: { upsertPlayer, patchPlayer, upsertZone },
    });
  }

  const rawHostId =
    typeof rawMeta.hostId === "string" && rawMeta.hostId.length > 0
      ? rawMeta.hostId
      : null;
  const hostExists = rawHostId ? Boolean(snapshot.players[rawHostId]) : false;
  if (!hostExists) {
    const hasPlayers = Object.keys(snapshot.players).length > 0;
    const desiredHostId = hasPlayers
      ? resolveHostId(snapshot.players, snapshot.playerOrder ?? [])
      : plan?.upsertPlayer
        ? params.playerId
        : null;
    if (desiredHostId && desiredHostId !== rawHostId) {
      params.transact(() => {
        patchRoomMeta(params.sharedMaps, { hostId: desiredHostId });
      });
    }
  }

  return null;
};
