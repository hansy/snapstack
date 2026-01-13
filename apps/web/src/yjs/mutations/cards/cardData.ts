import * as Y from "yjs";

import type { Card } from "@/types";
import { MAX_REVEALED_TO } from "@/lib/limits";
import {
  clampNormalizedPosition,
  migratePositionToNormalized,
} from "@/lib/positions";

import {
  MAX_CUSTOM_TEXT_LENGTH,
  MAX_NAME_LENGTH,
  MAX_ORACLE_TEXT_LENGTH,
  MAX_SCRYFALL_ID_LENGTH,
  MAX_TYPE_LINE_LENGTH,
} from "../../sanitizeLimits";

import type { SharedMaps } from "../shared";
import {
  clampString,
  ensureChildMap,
  ensureZoneOrder,
  isRecord,
  normalizeScryfallLiteForSync,
  readCounters,
  readValue,
  sanitizeCountersForSync,
  sanitizeImageUrl,
  writeCounters,
} from "../shared";

const isPositionLike = (value: unknown): value is { x: number; y: number } =>
  isRecord(value) && typeof value.x === "number" && typeof value.y === "number";

export const writeCard = (maps: SharedMaps, card: Card) => {
  const target = ensureChildMap(maps.cards, card.id);
  const normalizedPosition =
    card.position && (card.position.x > 1 || card.position.y > 1)
      ? migratePositionToNormalized(card.position)
      : clampNormalizedPosition(card.position || { x: 0.5, y: 0.5 });

  const countersMap = ensureChildMap(target, "counters");
  const counters = sanitizeCountersForSync(card.counters);
  writeCounters(countersMap, counters);

  const name = (card.name || "Card").slice(0, MAX_NAME_LENGTH);
  const imageUrl = sanitizeImageUrl(card.imageUrl);
  const oracleText = clampString(card.oracleText, MAX_ORACLE_TEXT_LENGTH);
  const typeLine = clampString(card.typeLine, MAX_TYPE_LINE_LENGTH);
  const scryfallId = clampString(card.scryfallId, MAX_SCRYFALL_ID_LENGTH);
  const scryfall = normalizeScryfallLiteForSync(card.scryfall);
  const customText = clampString(card.customText, MAX_CUSTOM_TEXT_LENGTH);
  const commanderTax =
    typeof card.commanderTax === "number" && Number.isFinite(card.commanderTax)
      ? Math.max(0, Math.min(99, Math.floor(card.commanderTax)))
      : 0;

  target.set("id", card.id);
  target.set("ownerId", card.ownerId);
  target.set("controllerId", card.controllerId);
  target.set("zoneId", card.zoneId);
  target.set("tapped", card.tapped);
  target.set("faceDown", card.faceDown);
  if (card.faceDownMode === undefined) target.delete("faceDownMode");
  else target.set("faceDownMode", card.faceDownMode);
  target.set("knownToAll", Boolean(card.knownToAll));
  target.set("revealedToAll", Boolean(card.revealedToAll));
  const revealedTo = Array.isArray(card.revealedTo)
    ? Array.from(new Set(card.revealedTo.filter((id) => typeof id === "string"))).slice(
        0,
        MAX_REVEALED_TO
      )
    : undefined;
  if (revealedTo === undefined) target.delete("revealedTo");
  else target.set("revealedTo", revealedTo);
  target.set("currentFaceIndex", card.currentFaceIndex ?? 0);
  target.set("position", normalizedPosition);
  target.set("rotation", card.rotation);
  target.set("name", name);
  target.set("imageUrl", imageUrl);
  target.set("oracleText", oracleText);
  target.set("typeLine", typeLine);
  target.set("scryfallId", scryfallId);
  target.set("scryfall", scryfall);
  target.set("isToken", card.isToken);
  target.set("isCommander", card.isCommander === true);
  target.set("commanderTax", commanderTax);
  target.set("power", clampString(card.power, 16));
  target.set("toughness", clampString(card.toughness, 16));
  target.set("basePower", clampString(card.basePower, 16));
  target.set("baseToughness", clampString(card.baseToughness, 16));
  target.set("customText", customText);

  const order = ensureZoneOrder(maps, card.zoneId);
  if (!order.toArray().includes(card.id)) {
    order.push([card.id]);
  }
};

export const readCard = (maps: SharedMaps, cardId: string): Card | null => {
  const target = maps.cards.get(cardId);
  if (!target) return null;
  const getVal = (key: string) => readValue(target, key);
  const counters = readCounters(getVal("counters"));
  const rawPosition = getVal("position");
  const normalizedPosition =
    isPositionLike(rawPosition)
      ? rawPosition.x > 1 || rawPosition.y > 1
        ? migratePositionToNormalized(rawPosition)
        : clampNormalizedPosition(rawPosition)
      : { x: 0.5, y: 0.5 };
  const rawCommanderTax = getVal("commanderTax");
  const rawFaceDownMode = getVal("faceDownMode");
  const faceDownMode = rawFaceDownMode === "morph" ? "morph" : undefined;
  const commanderTax =
    typeof rawCommanderTax === "number" && Number.isFinite(rawCommanderTax)
      ? Math.max(0, Math.min(99, Math.floor(rawCommanderTax)))
      : 0;

  return {
    id: cardId,
    ownerId: getVal("ownerId"),
    controllerId: getVal("controllerId"),
    zoneId: getVal("zoneId"),
    tapped: getVal("tapped"),
    faceDown: getVal("faceDown"),
    faceDownMode,
    knownToAll: getVal("knownToAll"),
    revealedToAll: getVal("revealedToAll"),
    revealedTo: getVal("revealedTo"),
    currentFaceIndex: getVal("currentFaceIndex"),
    position: normalizedPosition,
    rotation: getVal("rotation"),
    counters,
    name: getVal("name"),
    imageUrl: getVal("imageUrl"),
    oracleText: getVal("oracleText"),
    typeLine: getVal("typeLine"),
    scryfallId: getVal("scryfallId"),
    scryfall: getVal("scryfall"),
    isToken: getVal("isToken"),
    isCommander: getVal("isCommander") === true,
    commanderTax,
    power: getVal("power"),
    toughness: getVal("toughness"),
    basePower: getVal("basePower"),
    baseToughness: getVal("baseToughness"),
    customText: getVal("customText"),
  } as Card;
};

export type CardPatch = Partial<
  Pick<
    Card,
    | "tapped"
    | "faceDown"
    | "faceDownMode"
    | "knownToAll"
    | "revealedToAll"
    | "revealedTo"
    | "controllerId"
    | "rotation"
    | "currentFaceIndex"
    | "position"
    | "counters"
    | "isCommander"
    | "commanderTax"
    | "power"
    | "toughness"
    | "basePower"
    | "baseToughness"
    | "customText"
  >
>;

export const ensureCardMap = (maps: SharedMaps, cardId: string): Y.Map<any> | null => {
  const existing = maps.cards.get(cardId);
  if (existing instanceof Y.Map) return existing;

  const card = readCard(maps, cardId);
  if (!card) return null;

  const next = new Y.Map<any>();
  maps.cards.set(cardId, next);
  writeCard(maps, card);
  return maps.cards.get(cardId) as Y.Map<any>;
};

export const setIfChanged = (target: Y.Map<any>, key: string, value: unknown) => {
  const prev = target.get(key) as unknown;
  if (value === undefined) {
    if (prev !== undefined) target.delete(key);
    return;
  }
  if (key === "position" && isPositionLike(prev) && isPositionLike(value)) {
    if (prev.x === value.x && prev.y === value.y) return;
  } else if (prev === value) {
    return;
  }
  target.set(key, value);
};
