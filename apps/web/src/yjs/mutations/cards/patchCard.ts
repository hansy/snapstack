import { enforceZoneCounterRules } from "@/lib/counters";
import { MAX_REVEALED_TO } from "@/lib/limits";
import {
  clampNormalizedPosition,
  migratePositionToNormalized,
} from "@/lib/positions";

import { MAX_CUSTOM_TEXT_LENGTH } from "../../sanitizeLimits";

import type { SharedMaps } from "../shared";
import {
  clampString,
  ensureChildMap,
  sanitizeCountersForSync,
  writeCounters,
} from "../shared";
import { readZone } from "../zones";
import { CardPatch, ensureCardMap, setIfChanged } from "./cardData";

export function patchCard(maps: SharedMaps, cardId: string, updates: CardPatch) {
  const target = ensureCardMap(maps, cardId);
  if (!target) return;

  if ("tapped" in updates) setIfChanged(target, "tapped", updates.tapped);
  if ("faceDown" in updates) setIfChanged(target, "faceDown", updates.faceDown);
  if ("faceDownMode" in updates) setIfChanged(target, "faceDownMode", updates.faceDownMode);
  if ("knownToAll" in updates) setIfChanged(target, "knownToAll", updates.knownToAll);
  if ("revealedToAll" in updates) setIfChanged(target, "revealedToAll", updates.revealedToAll);
  if ("revealedTo" in updates) {
    const next =
      updates.revealedTo === undefined
        ? undefined
        : Array.isArray(updates.revealedTo)
          ? Array.from(new Set(updates.revealedTo.filter((id) => typeof id === "string"))).slice(
              0,
              MAX_REVEALED_TO
            )
          : [];
    setIfChanged(target, "revealedTo", next);
  }
  if ("controllerId" in updates) setIfChanged(target, "controllerId", updates.controllerId);
  if ("rotation" in updates) setIfChanged(target, "rotation", updates.rotation);
  if ("currentFaceIndex" in updates) {
    setIfChanged(target, "currentFaceIndex", updates.currentFaceIndex ?? 0);
  }
  if ("isCommander" in updates) {
    setIfChanged(target, "isCommander", updates.isCommander);
  }
  if ("commanderTax" in updates) {
    const value = updates.commanderTax;
    const next =
      typeof value === "number" && Number.isFinite(value)
        ? Math.max(0, Math.min(99, Math.floor(value)))
        : 0;
    setIfChanged(target, "commanderTax", next);
  }
  if ("customText" in updates) {
    setIfChanged(target, "customText", clampString(updates.customText, MAX_CUSTOM_TEXT_LENGTH));
  }
  if ("power" in updates) setIfChanged(target, "power", clampString(updates.power, 16));
  if ("toughness" in updates) setIfChanged(target, "toughness", clampString(updates.toughness, 16));
  if ("basePower" in updates) setIfChanged(target, "basePower", clampString(updates.basePower, 16));
  if ("baseToughness" in updates) {
    setIfChanged(target, "baseToughness", clampString(updates.baseToughness, 16));
  }

  if ("position" in updates && updates.position) {
    const normalized =
      updates.position.x > 1 || updates.position.y > 1
        ? migratePositionToNormalized(updates.position)
        : clampNormalizedPosition(updates.position);
    setIfChanged(target, "position", normalized);
  }

  if ("counters" in updates) {
    const zoneId = target.get("zoneId") as string | undefined;
    const zone = zoneId ? readZone(maps, zoneId) : null;
    const nextCounters = enforceZoneCounterRules(
      sanitizeCountersForSync(updates.counters),
      zone || undefined
    );
    const countersMap = ensureChildMap(target, "counters");
    writeCounters(countersMap, nextCounters);
  }
}
