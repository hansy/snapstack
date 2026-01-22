import type { Card } from "@/types";
import type { CardPatch } from "@/yjs/yMutations";

import { getCardFaces, getCurrentFaceIndex, syncCardStatsToFace } from "@/lib/cardDisplay";
import {
  bumpPosition,
  clampNormalizedPosition,
  findAvailablePositionNormalized,
  getNormalizedGridSteps,
  migratePositionToNormalized,
} from "@/lib/positions";
import { MAX_REVEALED_TO } from "@/lib/limits";

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

export const buildUpdateCardPatch = (cardBefore: Card, updates: Partial<Card>): { next: Card; patch: CardPatch } => {
  const normalizeCommanderTax = (value: number | undefined) => {
    if (value === undefined) return value;
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(99, Math.floor(value)));
  };

  const merged = { ...cardBefore, ...updates };
  const hasFaceDownModeUpdate = Object.prototype.hasOwnProperty.call(updates, "faceDownMode");
  if (updates.faceDown === false) {
    merged.faceDownMode = undefined;
  }
  if (updates.faceDown === true && !hasFaceDownModeUpdate) {
    merged.faceDownMode = undefined;
  }
  const commanderTax = normalizeCommanderTax(merged.commanderTax);
  const faces = getCardFaces(merged);
  const normalizedFaceIndex = faces.length
    ? Math.min(Math.max(merged.currentFaceIndex ?? 0, 0), faces.length - 1)
    : merged.currentFaceIndex;
  const targetFaceIndex = normalizedFaceIndex ?? merged.currentFaceIndex;
  const faceChanged = targetFaceIndex !== cardBefore.currentFaceIndex;

  const next = syncCardStatsToFace(
    { ...merged, currentFaceIndex: targetFaceIndex, commanderTax },
    targetFaceIndex,
    faceChanged ? undefined : { preserveExisting: true }
  );

  const patch: CardPatch = {};
  if (next.power !== cardBefore.power) patch.power = next.power;
  if (next.toughness !== cardBefore.toughness) patch.toughness = next.toughness;
  if (next.basePower !== cardBefore.basePower) patch.basePower = next.basePower;
  if (next.baseToughness !== cardBefore.baseToughness) patch.baseToughness = next.baseToughness;
  if (next.customText !== cardBefore.customText) patch.customText = next.customText;
  if (next.faceDown !== cardBefore.faceDown) patch.faceDown = next.faceDown;
  if (next.faceDownMode !== cardBefore.faceDownMode) patch.faceDownMode = next.faceDownMode;
  if (next.currentFaceIndex !== cardBefore.currentFaceIndex) patch.currentFaceIndex = next.currentFaceIndex;
  if (next.rotation !== cardBefore.rotation) patch.rotation = next.rotation;
  if (next.isCommander !== cardBefore.isCommander) patch.isCommander = next.isCommander;
  if (next.commanderTax !== cardBefore.commanderTax) patch.commanderTax = next.commanderTax;

  return { next, patch };
};

export const buildRevealPatch = (
  card: Card,
  reveal: { toAll?: boolean; to?: string[] } | null
): Pick<CardPatch, "revealedToAll" | "revealedTo"> => {
  if (!reveal) {
    return { revealedToAll: false, revealedTo: [] };
  }

  if (reveal.toAll) {
    return { revealedToAll: true, revealedTo: [] };
  }

  const to = Array.isArray(reveal.to) ? reveal.to.filter((id) => typeof id === "string" && id !== card.ownerId) : [];
  const unique = Array.from(new Set(to));

  return { revealedToAll: false, revealedTo: unique.slice(0, MAX_REVEALED_TO) };
};

export const computeDuplicateTokenPosition = (params: {
  sourceCard: Card;
  orderedCardIds: string[];
  cardsById: Record<string, Card>;
}): Card["position"] => {
  const { stepX, stepY } = getNormalizedGridSteps({
    isTapped: params.sourceCard.tapped,
  });
  const basePosition = bumpPosition(clampNormalizedPosition(params.sourceCard.position), stepX, stepY);
  return findAvailablePositionNormalized(basePosition, params.orderedCardIds, params.cardsById, stepX, stepY);
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
