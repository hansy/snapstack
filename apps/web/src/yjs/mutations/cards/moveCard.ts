import { enforceZoneCounterRules } from "@/lib/counters";
import {
  resolveBattlefieldCollisionPosition,
  resolveBattlefieldGroupCollisionPositions,
} from "@/lib/battlefieldCollision";
import {
  clampNormalizedPosition,
  migratePositionToNormalized,
} from "@/lib/positions";
import { resetCardToFrontFace } from "@/lib/cardDisplay";
import { ZONE } from "@/constants/zones";

import type { SharedMaps } from "../shared";
import { ensureZoneOrder, removeFromOrder } from "../shared";
import { readZone } from "../zones";
import { readCard, ensureCardMap, setIfChanged } from "./cardData";
import { patchCard } from "./patchCard";

export function moveCard(
  maps: SharedMaps,
  cardId: string,
  toZoneId: string,
  position?: { x: number; y: number },
  opts?: {
    skipCollision?: boolean;
    groupCollision?: {
      movingCardIds: string[];
      targetPositions: Record<string, { x: number; y: number } | undefined>;
    };
  }
) {
  const card = readCard(maps, cardId);
  if (!card) return;

  const fromZoneId = card.zoneId;
  const fromZone = readZone(maps, fromZoneId);
  const toZone = readZone(maps, toZoneId);
  if (!fromZone || !toZone) return;

  const target = ensureCardMap(maps, cardId);
  if (!target) return;

  const normalizedInput = position
    ? position.x > 1 || position.y > 1
      ? migratePositionToNormalized(position)
      : clampNormalizedPosition(position)
    : undefined;
  const basePosition = clampNormalizedPosition(normalizedInput ?? card.position);
  let newPosition = basePosition;

  const leavingBattlefield =
    fromZone.type === ZONE.BATTLEFIELD && toZone.type !== ZONE.BATTLEFIELD;

  if (
    toZone.type === ZONE.BATTLEFIELD &&
    position &&
    (!opts?.skipCollision || opts?.groupCollision)
  ) {
    const toOrder = ensureZoneOrder(maps, toZone.id, toZone.cardIds);
    if (opts?.groupCollision) {
      const resolvedPositions = resolveBattlefieldGroupCollisionPositions({
        movingCardIds: opts.groupCollision.movingCardIds,
        targetPositions: opts.groupCollision.targetPositions,
        orderedCardIds: toOrder.toArray(),
        getPosition: (id) => readCard(maps, id)?.position,
      });
      newPosition = resolvedPositions[cardId] ?? basePosition;
    } else {
      newPosition = resolveBattlefieldCollisionPosition({
        movingCardId: cardId,
        targetPosition: basePosition,
        orderedCardIds: toOrder.toArray(),
        getPosition: (id) => readCard(maps, id)?.position,
      });
    }
  }

  const fromOrder = ensureZoneOrder(maps, fromZoneId, fromZone.cardIds);
  removeFromOrder(fromOrder, cardId);
  const toOrder = ensureZoneOrder(maps, toZoneId, toZone.cardIds);
  removeFromOrder(toOrder, cardId);
  toOrder.push([cardId]);

  setIfChanged(target, "zoneId", toZoneId);

  const nextCounters = enforceZoneCounterRules(card.counters, toZone);
  const nextTapped = toZone.type === ZONE.BATTLEFIELD ? card.tapped : false;

  if (leavingBattlefield) {
    const resetToFront = resetCardToFrontFace(card);
    patchCard(maps, cardId, {
      position: newPosition,
      tapped: nextTapped,
      counters: nextCounters,
      currentFaceIndex: 0,
      power: resetToFront.power,
      toughness: resetToFront.toughness,
      basePower: resetToFront.basePower,
      baseToughness: resetToFront.baseToughness,
    });
    return;
  }

  patchCard(maps, cardId, { position: newPosition, tapped: nextTapped, counters: nextCounters });
}
