import type { Card, CardIdentity } from "../../../web/src/types/cards";
import type { Counter } from "../../../web/src/types/counters";
import type { Zone } from "../../../web/src/types/zones";

import { LEGACY_COMMAND_ZONE, ZONE } from "./constants";
import {
  bumpPosition,
  clampNormalizedPosition,
  findAvailablePositionNormalized,
  getNormalizedGridSteps,
  migratePositionToNormalized,
} from "./positions";

export const getCardFaces = (card: Card) => card.scryfall?.card_faces ?? [];

export const getCurrentFaceIndex = (card: Card): number => {
  const faces = getCardFaces(card);
  if (!faces.length) return 0;
  const index = card.currentFaceIndex ?? 0;
  if (index < 0) return 0;
  if (index >= faces.length) return faces.length - 1;
  return index;
};

export const syncCardStatsToFace = (
  card: Card,
  faceIndex?: number,
  options?: { preserveExisting?: boolean }
): Card => {
  const faces = getCardFaces(card);
  const targetIndex = faceIndex ?? getCurrentFaceIndex(card);
  const targetFace = faces[targetIndex];
  if (!targetFace) return { ...card, currentFaceIndex: targetIndex };

  const hasPower = targetFace.power !== undefined;
  const hasToughness = targetFace.toughness !== undefined;
  const preserve = options?.preserveExisting;

  return {
    ...card,
    currentFaceIndex: targetIndex,
    power: preserve && card.power !== undefined ? card.power : hasPower ? targetFace.power : undefined,
    toughness:
      preserve && card.toughness !== undefined
        ? card.toughness
        : hasToughness
          ? targetFace.toughness
          : undefined,
    basePower: hasPower ? targetFace.power : undefined,
    baseToughness: hasToughness ? targetFace.toughness : undefined,
  };
};

export const resetCardToFrontFace = (card: Card): Card => {
  const reset = syncCardStatsToFace({ ...card, currentFaceIndex: 0 }, 0);
  if (!getCardFaces(card).length) {
    return {
      ...reset,
      power: reset.basePower ?? reset.power,
      toughness: reset.baseToughness ?? reset.toughness,
    };
  }
  return reset;
};

const TRANSFORM_LAYOUTS = new Set([
  "transform",
  "modal_dfc",
  "dfc",
  "flip",
  "double_faced_token",
  "reversible_card",
  "meld",
]);

export const isTransformableCard = (card: Card): boolean => {
  const faces = getCardFaces(card);
  if (faces.length < 2) return false;
  const layout = card.scryfall?.layout;
  return layout ? TRANSFORM_LAYOUTS.has(layout) : true;
};

export const enforceZoneCounterRules = (counters: Counter[], zone?: Zone): Counter[] =>
  zone?.type === ZONE.BATTLEFIELD ? counters : [];

export const mergeCounters = (existing: Counter[], incoming: Counter): Counter[] => {
  const idx = existing.findIndex((c) => c.type === incoming.type);
  if (idx >= 0) {
    const next = [...existing];
    next[idx] = { ...next[idx], count: next[idx].count + incoming.count };
    return next;
  }
  return [...existing, incoming];
};

export const decrementCounter = (existing: Counter[], type: string, delta: number): Counter[] => {
  const idx = existing.findIndex((c) => c.type === type);
  if (idx === -1) return existing;

  const next = [...existing];
  const target = next[idx];
  const nextCount = target.count + delta;
  if (nextCount > 0) {
    next[idx] = { ...target, count: nextCount };
    return next;
  }
  next.splice(idx, 1);
  return next;
};

export const isCommanderZoneType = (zoneType: Zone["type"] | typeof LEGACY_COMMAND_ZONE) =>
  zoneType === ZONE.COMMANDER || zoneType === LEGACY_COMMAND_ZONE;

export const resolveControllerAfterMove = (card: Card, fromZone: Zone, toZone: Zone): string => {
  if (toZone.type === ZONE.BATTLEFIELD) {
    if (toZone.ownerId === card.ownerId) return card.ownerId;
    if (fromZone.ownerId !== toZone.ownerId) return toZone.ownerId;
  } else {
    if (card.controllerId !== card.ownerId) return card.ownerId;
  }
  return card.controllerId;
};

export const buildCardIdentity = (card: Card): CardIdentity => ({
  name: card.name ?? "Card",
  imageUrl: card.imageUrl,
  oracleText: card.oracleText,
  typeLine: card.typeLine,
  scryfallId: card.scryfallId,
  scryfall: card.scryfall,
  isToken: card.isToken,
});

export const mergeCardIdentity = (card: Card, identity?: CardIdentity | null): Card =>
  identity ? { ...card, ...identity } : card;

export const stripCardIdentity = (card: Card): Card => ({
  ...card,
  name: "Card",
  imageUrl: undefined,
  oracleText: undefined,
  typeLine: undefined,
  scryfallId: undefined,
  scryfall: undefined,
});

export const computeTransformTargetIndex = (
  card: Card,
  faceIndex?: number
): { targetIndex: number; toFaceName?: string } => {
  const faces = getCardFaces(card);
  const targetIndex = faces.length
    ? typeof faceIndex === "number"
      ? Math.min(Math.max(faceIndex, 0), faces.length - 1)
      : (getCurrentFaceIndex(card) + 1) % faces.length
    : 0;

  return { targetIndex, toFaceName: faces[targetIndex]?.name };
};

export const applyCardUpdates = (
  card: Card,
  updates: Record<string, unknown>,
  zoneType?: Zone["type"]
): Card => {
  const hasFaceDownModeUpdate = Object.prototype.hasOwnProperty.call(updates, "faceDownMode");
  const merged = { ...card, ...updates } as Card;

  if (updates.faceDown === false) {
    merged.faceDownMode = undefined;
  }
  if (updates.faceDown === true && !hasFaceDownModeUpdate) {
    merged.faceDownMode = undefined;
  }

  if (Object.prototype.hasOwnProperty.call(updates, "commanderTax")) {
    const raw = merged.commanderTax ?? 0;
    const normalized = Number.isFinite(raw) ? Math.max(0, Math.min(99, Math.floor(raw))) : 0;
    merged.commanderTax = normalized;
  }

  const faces = getCardFaces(merged);
  const normalizedFaceIndex = faces.length
    ? Math.min(Math.max(merged.currentFaceIndex ?? 0, 0), faces.length - 1)
    : merged.currentFaceIndex;
  const targetFaceIndex = normalizedFaceIndex ?? merged.currentFaceIndex;
  const faceChanged = targetFaceIndex !== card.currentFaceIndex;

  const next = syncCardStatsToFace(
    { ...merged, currentFaceIndex: targetFaceIndex },
    targetFaceIndex,
    faceChanged ? undefined : { preserveExisting: true }
  );

  if (zoneType === ZONE.BATTLEFIELD) {
    const shouldMarkKnownAfterFaceUp = updates.faceDown === false && card.faceDown === true;
    const shouldHideAfterFaceDown = updates.faceDown === true && card.faceDown === false;
    if (shouldMarkKnownAfterFaceUp) {
      next.knownToAll = true;
    }
    if (shouldHideAfterFaceDown) {
      next.knownToAll = false;
      next.revealedToAll = false;
      next.revealedTo = [];
    }
  }

  return next;
};

export const normalizeCardForAdd = (card: Card): Card => {
  const faces = getCardFaces(card);
  const initialFaceIndex = card.currentFaceIndex ?? 0;
  const normalizedFaceIndex = faces.length
    ? Math.min(Math.max(initialFaceIndex, 0), faces.length - 1)
    : initialFaceIndex;

  const withFaceStats = syncCardStatsToFace({ ...card, currentFaceIndex: initialFaceIndex }, normalizedFaceIndex);

  const rawPosition = (withFaceStats as Partial<Card>).position;
  const normalizedPosition =
    rawPosition && (rawPosition.x > 1 || rawPosition.y > 1)
      ? migratePositionToNormalized(rawPosition)
      : clampNormalizedPosition(rawPosition || { x: 0.5, y: 0.5 });

  return { ...withFaceStats, position: normalizedPosition };
};

export const buildDuplicateTokenCard = (params: {
  sourceCard: Card;
  newCardId: string;
  position: Card["position"];
}): Card => ({
  ...params.sourceCard,
  id: params.newCardId,
  isToken: true,
  isCommander: false,
  commanderTax: 0,
  position: params.position,
  counters: params.sourceCard.counters.map((counter) => ({ ...counter })),
});

export const computeDuplicateTokenPosition = (params: {
  sourceCard: Card;
  orderedCardIds: string[];
  cardsById: Record<string, { position: Card["position"] }>;
}): Card["position"] => {
  const { stepX, stepY } = getNormalizedGridSteps({
    isTapped: params.sourceCard.tapped,
  });
  const basePosition = bumpPosition(clampNormalizedPosition(params.sourceCard.position), stepX, stepY);
  return findAvailablePositionNormalized(basePosition, params.orderedCardIds, params.cardsById, stepX, stepY);
};
