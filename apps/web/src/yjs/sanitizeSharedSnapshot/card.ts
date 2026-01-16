import type { Card, Zone } from "@/types";

import { MAX_REVEALED_TO } from "@/lib/limits";

import { MAX_NAME_LENGTH } from "../sanitizeLimits";

import { sanitizeCounters } from "./counters";
import { clampNumber, normalizePosition } from "./utils";

export const sanitizeCard = (value: any, zones: Record<string, Zone>): Card | null => {
  if (!value || typeof value.id !== "string" || typeof value.zoneId !== "string") return null;
  const zone = zones[value.zoneId];
  if (!zone) return null;
  if (zone.type === "hand" || zone.type === "library" || zone.type === "sideboard") return null;
  if (typeof value.ownerId !== "string" || typeof value.controllerId !== "string") return null;

  const counters = sanitizeCounters(value.counters);
  const position = normalizePosition(value.position);
  const rotation = clampNumber(value.rotation, -360, 360, 0);
  const revealedTo = Array.isArray(value.revealedTo)
    ? Array.from(
        new Set(
          (value.revealedTo as unknown[]).filter(
            (pid): pid is string => typeof pid === "string"
          )
        )
      ).slice(0, MAX_REVEALED_TO)
    : undefined;
  const faceIndex =
    typeof value.currentFaceIndex === "number" && Number.isFinite(value.currentFaceIndex)
      ? Math.max(0, Math.floor(value.currentFaceIndex))
      : 0;
  const faceDownMode = value.faceDownMode === "morph" ? "morph" : undefined;

  return {
    id: value.id,
    ownerId: value.ownerId,
    controllerId: value.controllerId,
    zoneId: value.zoneId,
    tapped: Boolean(value.tapped),
    faceDown: Boolean(value.faceDown),
    faceDownMode,
    knownToAll: Boolean(value.knownToAll),
    revealedToAll: Boolean(value.revealedToAll),
    revealedTo,
    currentFaceIndex: faceIndex,
    position,
    rotation,
    counters,
    name: typeof value.name === "string" ? value.name.slice(0, MAX_NAME_LENGTH) : "Card",
    imageUrl: typeof value.imageUrl === "string" ? value.imageUrl : undefined,
    oracleText: typeof value.oracleText === "string" ? value.oracleText : undefined,
    typeLine: typeof value.typeLine === "string" ? value.typeLine : undefined,
    scryfallId: typeof value.scryfallId === "string" ? value.scryfallId : undefined,
    scryfall: value.scryfall,
    isToken: value.isToken === true,
    isCommander: value.isCommander === true,
    commanderTax: clampNumber(value.commanderTax, 0, 99, 0),
    power: typeof value.power === "string" ? value.power : value.power?.toString(),
    toughness: typeof value.toughness === "string" ? value.toughness : value.toughness?.toString(),
    basePower: typeof value.basePower === "string" ? value.basePower : value.basePower?.toString(),
    baseToughness:
      typeof value.baseToughness === "string"
        ? value.baseToughness
        : value.baseToughness?.toString(),
    customText: typeof value.customText === "string" ? value.customText.slice(0, 280) : undefined,
  };
};
