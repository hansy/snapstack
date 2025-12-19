import { enforceZoneCounterRules } from "@/lib/counters";
import { computeBattlefieldCollisionPatches } from "@/lib/battlefieldCollision";
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
  position?: { x: number; y: number }
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
  const newPosition = clampNormalizedPosition(normalizedInput ?? card.position);

  const leavingBattlefield =
    fromZone.type === ZONE.BATTLEFIELD && toZone.type !== ZONE.BATTLEFIELD;

  if (toZone.type === ZONE.BATTLEFIELD && position) {
    const toOrder = ensureZoneOrder(maps, toZone.id, toZone.cardIds);
    const patches = computeBattlefieldCollisionPatches({
      movingCardId: cardId,
      targetPosition: newPosition,
      orderedCardIds: toOrder.toArray(),
      getPosition: (id) => readCard(maps, id)?.position,
    });
    patches.forEach(({ id, position }) => patchCard(maps, id, { position }));
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

