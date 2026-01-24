import type { Card } from "@mtg/shared/types/cards";
import type { Player } from "@mtg/shared/types/players";
import type { Zone } from "@mtg/shared/types/zones";
import { MAX_PLAYERS } from "@mtg/shared/constants/room";

import {
  applyRecordToMap,
  buildSnapshot,
  readPlayer,
  resolveNextHostId,
  syncPlayerOrder,
  syncZoneOrder,
  writePlayer,
} from "../../yjsStore";
import { syncLibraryRevealsToAllForPlayer, updatePlayerCounts } from "../../hiddenState";
import { canUpdatePlayer } from "../../permissions";
import {
  ensurePermission,
  readString,
  requireNonEmptyStringProp,
  requireRecordProp,
} from "../validation";
import type { IntentHandler } from "./types";

const handlePlayerJoin: IntentHandler = ({ actorId, maps, hidden, payload, markHiddenChanged }) => {
  const playerResult = requireRecordProp(payload, "player", "invalid player");
  if (!playerResult.ok) return playerResult;
  const player = playerResult.value as unknown as Player;
  if (typeof player.id !== "string") {
    return { ok: false, error: "invalid player" };
  }
  if (player.id !== actorId) {
    return { ok: false, error: "actor mismatch" };
  }

  const existing = readPlayer(maps, player.id);
  if (!existing) {
    const locked = Boolean(maps.meta.get("locked"));
    if (locked) return { ok: false, error: "room locked" };
    if (maps.players.size >= MAX_PLAYERS) {
      return { ok: false, error: "room full" };
    }
    writePlayer(maps, player);
  }

  let initializedHidden = false;
  if (!hidden.handOrder[player.id]) {
    hidden.handOrder[player.id] = [];
    initializedHidden = true;
  }
  if (!hidden.libraryOrder[player.id]) {
    hidden.libraryOrder[player.id] = [];
    initializedHidden = true;
  }
  if (!hidden.sideboardOrder[player.id]) {
    hidden.sideboardOrder[player.id] = [];
    initializedHidden = true;
  }
  if (initializedHidden) {
    updatePlayerCounts(maps, hidden, player.id);
    markHiddenChanged({ ownerId: player.id });
  }
  const currentHost = maps.meta.get("hostId");
  if (typeof currentHost !== "string" || !maps.players.get(currentHost)) {
    maps.meta.set("hostId", player.id);
  }
  return { ok: true };
};

const handlePlayerUpdate: IntentHandler = ({ actorId, maps, hidden, payload, pushLogEvent, markHiddenChanged }) => {
  const playerIdResult = requireNonEmptyStringProp(payload, "playerId", "invalid player update");
  if (!playerIdResult.ok) return playerIdResult;
  const updatesResult = requireRecordProp(payload, "updates", "invalid player update");
  if (!updatesResult.ok) return updatesResult;
  const playerId = playerIdResult.value;
  const updates = updatesResult.value;
  const current = readPlayer(maps, playerId);
  if (!current) return { ok: false, error: "player not found" };
  const permission = canUpdatePlayer(actorId, current, updates);
  const allowed = ensurePermission(permission);
  if (!allowed.ok) return allowed;
  if (typeof (updates as Record<string, unknown>).life === "number" && updates.life !== current.life) {
    const from = typeof current.life === "number" ? current.life : 0;
    const to = (updates as Record<string, unknown>).life as number;
    pushLogEvent("player.life", {
      actorId,
      playerId,
      from,
      to,
      delta: to - from,
    });
  }
  if (
    Object.prototype.hasOwnProperty.call(updates, "libraryTopReveal") &&
    (updates as Record<string, unknown>).libraryTopReveal !== current.libraryTopReveal
  ) {
    const previousMode = current.libraryTopReveal;
    const nextMode = (updates as Record<string, unknown>).libraryTopReveal;
    const enabled = Boolean(nextMode);
    const mode = enabled ? nextMode : previousMode;
    if (typeof mode === "string") {
      pushLogEvent("library.topReveal", {
        actorId,
        playerId,
        enabled,
        mode,
      });
    }
    writePlayer(maps, { ...current, ...updates, id: playerId });
    syncLibraryRevealsToAllForPlayer(maps, hidden, playerId);
    const prevReveal = previousMode === "all" ? { toAll: true } : undefined;
    const nextReveal = nextMode === "all" ? { toAll: true } : undefined;
    markHiddenChanged({
      ownerId: playerId,
      ...(nextReveal ? { reveal: nextReveal } : null),
      ...(prevReveal ? { prevReveal } : null),
    });
    return { ok: true };
  }
  writePlayer(maps, { ...current, ...updates, id: playerId });
  return { ok: true };
};

const handlePlayerLeave: IntentHandler = ({ actorId, maps, hidden, payload, markHiddenChanged }) => {
  const requestedPlayerId = readString(payload.playerId) ?? null;
  const playerId = requestedPlayerId && requestedPlayerId === actorId ? requestedPlayerId : actorId;
  if (!playerId) return { ok: false, error: "invalid player" };

  const snapshot = buildSnapshot(maps);
  const nextPlayers = { ...snapshot.players };
  delete nextPlayers[playerId];

  const nextOrder = snapshot.playerOrder.filter((id) => id !== playerId);

  const nextZones: Record<string, Zone> = {};
  Object.values(snapshot.zones).forEach((zone) => {
    if (zone.ownerId === playerId) return;
    nextZones[zone.id] = { ...zone };
  });

  const nextCards: Record<string, Card> = {};
  Object.values(snapshot.cards).forEach((card) => {
    if (card.ownerId === playerId) return;
    const zone = nextZones[card.zoneId];
    if (!zone) return;
    nextCards[card.id] = { ...card };
  });

  Object.values(nextZones).forEach((zone) => {
    zone.cardIds = zone.cardIds.filter((id) => nextCards[id]);
  });

  const nextMeta = { ...snapshot.meta };
  const hostId = typeof nextMeta.hostId === "string" ? (nextMeta.hostId as string) : null;
  if (!hostId || hostId === playerId || !nextPlayers[hostId]) {
    nextMeta.hostId = resolveNextHostId(nextPlayers, nextOrder);
  }

  applyRecordToMap(maps.players, nextPlayers as Record<string, unknown>);
  applyRecordToMap(maps.cards, nextCards as Record<string, unknown>);
  applyRecordToMap(maps.zones, nextZones as Record<string, unknown>);
  applyRecordToMap(maps.meta, nextMeta);
  syncPlayerOrder(maps.playerOrder, nextOrder);
  maps.battlefieldViewScale.delete(playerId);

  Object.values(nextZones).forEach((zone) => {
    syncZoneOrder(maps, zone.id, zone.cardIds);
  });

  maps.zoneCardOrders.forEach((_value, key) => {
    const zoneId = String(key);
    if (!nextZones[zoneId]) maps.zoneCardOrders.delete(zoneId);
  });

  const hiddenRemoveIds = Object.values(hidden.cards)
    .filter((card) => card.ownerId === playerId)
    .map((card) => card.id);
  hiddenRemoveIds.forEach((id) => {
    Reflect.deleteProperty(hidden.cards, id);
    Reflect.deleteProperty(hidden.handReveals, id);
    Reflect.deleteProperty(hidden.libraryReveals, id);
    maps.handRevealsToAll.delete(id);
    maps.libraryRevealsToAll.delete(id);
  });
  Reflect.deleteProperty(hidden.handOrder, playerId);
  Reflect.deleteProperty(hidden.libraryOrder, playerId);
  Reflect.deleteProperty(hidden.sideboardOrder, playerId);
  Object.keys(hidden.faceDownBattlefield).forEach((id) => {
    if (!maps.cards.get(id)) {
      Reflect.deleteProperty(hidden.faceDownBattlefield, id);
      Reflect.deleteProperty(hidden.faceDownReveals, id);
      maps.faceDownRevealsToAll.delete(id);
    }
  });
  markHiddenChanged({ ownerId: playerId, reveal: { toAll: true } });
  return { ok: true };
};

export const playerIntentHandlers: Record<string, IntentHandler> = {
  "player.join": handlePlayerJoin,
  "player.update": handlePlayerUpdate,
  "player.leave": handlePlayerLeave,
};
