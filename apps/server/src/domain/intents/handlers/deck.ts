import { ZONE } from "../../constants";
import { syncLibraryRevealsToAllForPlayer, updatePlayerCounts } from "../../hiddenState";
import { applyMulligan, applyResetDeck, applyUnloadDeck } from "../../deck";
import { shuffle } from "../../random";
import { findZoneByTypeInMaps } from "../../zones";
import { canViewHiddenZone } from "../../permissions";
import { readPlayer, writePlayer } from "../../yjsStore";
import { applyCardMove } from "../../movement";
import { ensurePermission, readNumber, requireNonEmptyStringProp } from "../validation";
import type { IntentHandler } from "./types";

const handleLibraryDraw: IntentHandler = ({ actorId, maps, hidden, payload, pushLogEvent, markHiddenChanged }) => {
  const playerIdResult = requireNonEmptyStringProp(payload, "playerId", "invalid player");
  if (!playerIdResult.ok) return playerIdResult;
  const count = readNumber(payload.count) ?? 1;
  const playerId = playerIdResult.value;
  const libraryZone = findZoneByTypeInMaps(maps, playerId, ZONE.LIBRARY);
  const handZone = findZoneByTypeInMaps(maps, playerId, ZONE.HAND);
  if (!libraryZone || !handZone) return { ok: false, error: "zone not found" };
  const permission = canViewHiddenZone(actorId, libraryZone);
  const allowed = ensurePermission(permission);
  if (!allowed.ok) return allowed;
  const drawCount = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  for (let i = 0; i < drawCount; i += 1) {
    const order = hidden.libraryOrder[playerId] ?? [];
    const cardId = order.length ? order[order.length - 1] : null;
    if (!cardId) break;
    const result = applyCardMove(
      maps,
      hidden,
      { cardId, toZoneId: handZone.id, actorId: payload.actorId, opts: { suppressLog: true } },
      "top",
      pushLogEvent,
      markHiddenChanged
    );
    if (!result.ok) return result;
  }
  syncLibraryRevealsToAllForPlayer(maps, hidden, playerId, libraryZone.id);
  return { ok: true };
};

const handleLibraryDiscard: IntentHandler = ({ actorId, maps, hidden, payload, pushLogEvent, markHiddenChanged }) => {
  const playerIdResult = requireNonEmptyStringProp(payload, "playerId", "invalid player");
  if (!playerIdResult.ok) return playerIdResult;
  const count = readNumber(payload.count) ?? 1;
  const playerId = playerIdResult.value;
  const libraryZone = findZoneByTypeInMaps(maps, playerId, ZONE.LIBRARY);
  const graveyardZone = findZoneByTypeInMaps(maps, playerId, ZONE.GRAVEYARD);
  if (!libraryZone || !graveyardZone) return { ok: false, error: "zone not found" };
  const permission = canViewHiddenZone(actorId, libraryZone);
  const allowed = ensurePermission(permission);
  if (!allowed.ok) return allowed;
  const discardCount = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  for (let i = 0; i < discardCount; i += 1) {
    const order = hidden.libraryOrder[playerId] ?? [];
    const cardId = order.length ? order[order.length - 1] : null;
    if (!cardId) break;
    const result = applyCardMove(
      maps,
      hidden,
      { cardId, toZoneId: graveyardZone.id, actorId: payload.actorId, opts: { suppressLog: true } },
      "top",
      pushLogEvent,
      markHiddenChanged
    );
    if (!result.ok) return result;
  }
  syncLibraryRevealsToAllForPlayer(maps, hidden, playerId, libraryZone.id);
  return { ok: true };
};

const handleLibraryShuffle: IntentHandler = ({ actorId, maps, hidden, payload, pushLogEvent, markHiddenChanged }) => {
  const playerIdResult = requireNonEmptyStringProp(payload, "playerId", "invalid player");
  if (!playerIdResult.ok) return playerIdResult;
  const playerId = playerIdResult.value;
  const libraryZone = findZoneByTypeInMaps(maps, playerId, ZONE.LIBRARY);
  if (!libraryZone) return { ok: false, error: "zone not found" };
  const permission = canViewHiddenZone(actorId, libraryZone);
  const allowed = ensurePermission(permission);
  if (!allowed.ok) return allowed;
  const current = hidden.libraryOrder[playerId] ?? [];
  const shuffled = shuffle(current);
  hidden.libraryOrder[playerId] = shuffled;
  shuffled.forEach((id) => {
    const card = hidden.cards[id];
    if (card) {
      hidden.cards[id] = { ...card, knownToAll: false };
    }
    Reflect.deleteProperty(hidden.libraryReveals, id);
    maps.libraryRevealsToAll.delete(id);
  });
  updatePlayerCounts(maps, hidden, playerId);
  syncLibraryRevealsToAllForPlayer(maps, hidden, playerId);
  const player = readPlayer(maps, playerId);
  markHiddenChanged({
    ownerId: playerId,
    zoneId: libraryZone.id,
    ...(player?.libraryTopReveal === "all" ? { reveal: { toAll: true } } : null),
  });
  pushLogEvent("library.shuffle", {
    actorId,
    playerId,
  });
  return { ok: true };
};

const handleDeckReset: IntentHandler = ({ actorId, maps, hidden, payload, pushLogEvent, markHiddenChanged }) => {
  const playerIdResult = requireNonEmptyStringProp(payload, "playerId", "invalid player");
  if (!playerIdResult.ok) return playerIdResult;
  const playerId = playerIdResult.value;
  const libraryZone = findZoneByTypeInMaps(maps, playerId, ZONE.LIBRARY);
  if (!libraryZone) return { ok: false, error: "zone not found" };
  const permission = canViewHiddenZone(actorId, libraryZone);
  const allowed = ensurePermission(permission);
  if (!allowed.ok) return allowed;
  applyResetDeck(maps, hidden, playerId);
  const player = readPlayer(maps, playerId);
  markHiddenChanged({
    ownerId: playerId,
    zoneId: libraryZone.id,
    ...(player?.libraryTopReveal === "all" ? { reveal: { toAll: true } } : null),
  });
  pushLogEvent("deck.reset", {
    actorId,
    playerId,
  });
  return { ok: true };
};

const handleDeckUnload: IntentHandler = ({ actorId, maps, hidden, payload, pushLogEvent, markHiddenChanged }) => {
  const playerIdResult = requireNonEmptyStringProp(payload, "playerId", "invalid player");
  if (!playerIdResult.ok) return playerIdResult;
  const playerId = playerIdResult.value;
  const libraryZone = findZoneByTypeInMaps(maps, playerId, ZONE.LIBRARY);
  if (!libraryZone) return { ok: false, error: "zone not found" };
  const permission = canViewHiddenZone(actorId, libraryZone);
  const allowed = ensurePermission(permission);
  if (!allowed.ok) return allowed;
  applyUnloadDeck(maps, hidden, playerId);
  const player = readPlayer(maps, playerId);
  markHiddenChanged({
    ownerId: playerId,
    zoneId: libraryZone.id,
    ...(player?.libraryTopReveal === "all" ? { reveal: { toAll: true } } : null),
  });
  pushLogEvent("deck.unload", {
    actorId,
    playerId,
  });
  return { ok: true };
};

const handleDeckMulligan: IntentHandler = ({ actorId, maps, hidden, payload, pushLogEvent, markHiddenChanged }) => {
  const playerIdResult = requireNonEmptyStringProp(payload, "playerId", "invalid player");
  if (!playerIdResult.ok) return playerIdResult;
  const count = readNumber(payload.count) ?? 0;
  const playerId = playerIdResult.value;
  const libraryZone = findZoneByTypeInMaps(maps, playerId, ZONE.LIBRARY);
  if (!libraryZone) return { ok: false, error: "zone not found" };
  const permission = canViewHiddenZone(actorId, libraryZone);
  const allowed = ensurePermission(permission);
  if (!allowed.ok) return allowed;
  const mulliganDrawCount = applyMulligan(maps, hidden, playerId, count);
  const player = readPlayer(maps, playerId);
  markHiddenChanged({
    ownerId: playerId,
    zoneId: libraryZone.id,
    ...(player?.libraryTopReveal === "all" ? { reveal: { toAll: true } } : null),
  });
  pushLogEvent("deck.reset", {
    actorId,
    playerId,
  });
  if (mulliganDrawCount > 0) {
    pushLogEvent("card.draw", {
      actorId,
      playerId,
      count: mulliganDrawCount,
    });
  }
  return { ok: true };
};

const handleDeckLoad: IntentHandler = ({ actorId, maps, payload }) => {
  const playerIdResult = requireNonEmptyStringProp(payload, "playerId", "invalid player");
  if (!playerIdResult.ok) return playerIdResult;
  const playerId = playerIdResult.value;
  if (playerId !== actorId) {
    return { ok: false, error: "actor mismatch" };
  }
  const player = readPlayer(maps, playerId);
  if (!player) return { ok: true };
  writePlayer(maps, { ...player, deckLoaded: true });
  return { ok: true };
};

const handleLibraryView: IntentHandler = ({ actorId, maps, payload, pushLogEvent }) => {
  const playerIdResult = requireNonEmptyStringProp(payload, "playerId", "invalid player");
  if (!playerIdResult.ok) return playerIdResult;
  const count = readNumber(payload.count);
  const playerId = playerIdResult.value;
  const libraryZone = findZoneByTypeInMaps(maps, playerId, ZONE.LIBRARY);
  if (!libraryZone) return { ok: false, error: "zone not found" };
  const permission = canViewHiddenZone(actorId, libraryZone);
  const allowed = ensurePermission(permission);
  if (!allowed.ok) return allowed;
  pushLogEvent("library.view", {
    actorId,
    playerId,
    ...(count !== undefined ? { count } : {}),
  });
  return { ok: true };
};

const handleLibraryViewStatus: IntentHandler = ({ actorId, maps, payload }) => {
  const playerIdResult = requireNonEmptyStringProp(payload, "playerId", "invalid player");
  if (!playerIdResult.ok) return playerIdResult;
  const playerId = playerIdResult.value;
  const libraryZone = findZoneByTypeInMaps(maps, playerId, ZONE.LIBRARY);
  if (!libraryZone) return { ok: false, error: "zone not found" };
  const permission = canViewHiddenZone(actorId, libraryZone);
  const allowed = ensurePermission(permission);
  if (!allowed.ok) return allowed;
  return { ok: true };
};

export const deckIntentHandlers: Record<string, IntentHandler> = {
  "library.draw": handleLibraryDraw,
  "library.discard": handleLibraryDiscard,
  "library.shuffle": handleLibraryShuffle,
  "deck.reset": handleDeckReset,
  "deck.unload": handleDeckUnload,
  "deck.mulligan": handleDeckMulligan,
  "deck.load": handleDeckLoad,
  "library.view": handleLibraryView,
  "library.view.close": handleLibraryViewStatus,
  "library.view.ping": handleLibraryViewStatus,
};
