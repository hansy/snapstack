import { clampNumber } from "../../positions";
import { ensureActorMatches, readNumber, requireNonEmptyStringProp } from "../validation";
import type { IntentHandler } from "./types";

const handleRoomLock: IntentHandler = ({ actorId, maps, payload }) => {
  const locked = Boolean(payload.locked);
  const hostId = maps.meta.get("hostId");
  if (typeof hostId === "string" && hostId !== actorId) {
    return { ok: false, error: "Only host may lock the room" };
  }
  maps.meta.set("locked", locked);
  return { ok: true };
};

const handleBattlefieldScale: IntentHandler = ({ actorId, maps, payload }) => {
  const playerIdResult = requireNonEmptyStringProp(payload, "playerId", "invalid scale");
  if (!playerIdResult.ok) return playerIdResult;
  const scaleRaw = readNumber(payload.scale);
  if (scaleRaw === undefined) return { ok: false, error: "invalid scale" };
  const allowed = ensureActorMatches(actorId, playerIdResult.value);
  if (!allowed.ok) return allowed;
  maps.battlefieldViewScale.set(playerIdResult.value, clampNumber(scaleRaw, 0.5, 1));
  return { ok: true };
};

const handleGlobalCounterAdd: IntentHandler = ({ maps, payload }) => {
  const counterTypeResult = requireNonEmptyStringProp(payload, "counterType", "invalid counter");
  if (!counterTypeResult.ok) return counterTypeResult;
  const colorResult = requireNonEmptyStringProp(payload, "color", "invalid counter");
  if (!colorResult.ok) return colorResult;
  if (!maps.globalCounters.get(counterTypeResult.value)) {
    maps.globalCounters.set(counterTypeResult.value, colorResult.value);
  }
  return { ok: true };
};

const handleCoinFlip: IntentHandler = ({ actorId, payload, pushLogEvent }) => {
  const count = readNumber(payload.count);
  const results = Array.isArray(payload.results)
    ? payload.results.filter((value) => value === "heads" || value === "tails")
    : null;
  const safeCount = typeof count === "number" && Number.isFinite(count) ? Math.floor(count) : 0;
  if (!safeCount || !results || results.length === 0) {
    return { ok: false, error: "invalid coin flip" };
  }
  pushLogEvent("coin.flip", {
    actorId,
    count: safeCount,
    results,
  });
  return { ok: true };
};

const handleDiceRoll: IntentHandler = ({ actorId, payload, pushLogEvent }) => {
  const sides = readNumber(payload.sides);
  const count = readNumber(payload.count);
  const results = Array.isArray(payload.results)
    ? payload.results.filter((value) => typeof value === "number")
    : null;
  if (!sides || !count || !results) return { ok: false, error: "invalid dice roll" };
  pushLogEvent("dice.roll", {
    actorId,
    sides,
    count,
    results,
  });
  return { ok: true };
};

export const miscIntentHandlers: Record<string, IntentHandler> = {
  "room.lock": handleRoomLock,
  "ui.battlefieldScale.set": handleBattlefieldScale,
  "counter.global.add": handleGlobalCounterAdd,
  "coin.flip": handleCoinFlip,
  "dice.roll": handleDiceRoll,
};
