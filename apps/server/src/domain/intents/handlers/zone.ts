import type { Zone } from "@mtg/shared/types/zones";

import { ZONE, isHiddenZoneType } from "../../constants";
import { updatePlayerCounts, syncLibraryRevealsToAllForPlayer } from "../../hiddenState";
import { hasSameMembers } from "../../lists";
import { readPlayer, readZone, uniqueStrings, writeZone } from "../../yjsStore";
import { readRecordValue, requireNonEmptyStringProp } from "../validation";
import type { IntentHandler } from "./types";

const handleZoneAdd: IntentHandler = ({ actorId, maps, hidden, payload, markHiddenChanged }) => {
  const rawZone = readRecordValue(payload.zone);
  const zone = rawZone ? (rawZone as unknown as Zone) : null;
  if (!zone || typeof zone.id !== "string") return { ok: false, error: "invalid zone" };
  const existing = readZone(maps, zone.id);
  if (existing) {
    if (existing.ownerId !== zone.ownerId || existing.type !== zone.type) {
      return { ok: false, error: "zone mismatch" };
    }
    if (existing.ownerId !== actorId) {
      return { ok: false, error: "Only zone owner may add zones" };
    }
    return { ok: true };
  }
  if (zone.ownerId !== actorId) {
    return { ok: false, error: "Only zone owner may add zones" };
  }
  const nextCardIds = uniqueStrings(zone.cardIds ?? []);
  const normalized = {
    ...zone,
    cardIds:
      zone.type === ZONE.HAND ? nextCardIds : isHiddenZoneType(zone.type) ? [] : nextCardIds,
  } as unknown as Zone;
  writeZone(maps, normalized);
  if (isHiddenZoneType(zone.type)) {
    if (zone.type === ZONE.HAND && !hidden.handOrder[zone.ownerId]) {
      hidden.handOrder[zone.ownerId] = normalized.cardIds;
    }
    if (zone.type === ZONE.LIBRARY && !hidden.libraryOrder[zone.ownerId]) {
      hidden.libraryOrder[zone.ownerId] = [];
    }
    if (zone.type === ZONE.SIDEBOARD && !hidden.sideboardOrder[zone.ownerId]) {
      hidden.sideboardOrder[zone.ownerId] = [];
    }
    updatePlayerCounts(maps, hidden, zone.ownerId);
    markHiddenChanged({ ownerId: zone.ownerId, zoneId: zone.id });
  }
  return { ok: true };
};

const handleZoneReorder: IntentHandler = ({ actorId, maps, hidden, payload, markHiddenChanged }) => {
  const zoneIdResult = requireNonEmptyStringProp(payload, "zoneId", "invalid reorder");
  if (!zoneIdResult.ok) return zoneIdResult;
  const orderedCardIds = Array.isArray(payload.orderedCardIds)
    ? uniqueStrings(payload.orderedCardIds as unknown[])
    : null;
  if (!orderedCardIds) return { ok: false, error: "invalid reorder" };
  const zone = readZone(maps, zoneIdResult.value);
  if (!zone) return { ok: false, error: "zone not found" };
  if (zone.ownerId !== actorId) {
    return { ok: false, error: "Only zone owner may reorder cards" };
  }
  const currentOrder = isHiddenZoneType(zone.type)
    ? zone.type === ZONE.HAND
      ? hidden.handOrder[zone.ownerId] ?? []
      : zone.type === ZONE.LIBRARY
        ? hidden.libraryOrder[zone.ownerId] ?? []
        : hidden.sideboardOrder[zone.ownerId] ?? []
    : zone.cardIds;
  if (!hasSameMembers(currentOrder, orderedCardIds)) {
    return { ok: false, error: "invalid reorder" };
  }
  if (zone.type === ZONE.HAND) {
    hidden.handOrder[zone.ownerId] = orderedCardIds;
    writeZone(maps, { ...zone, cardIds: orderedCardIds });
    updatePlayerCounts(maps, hidden, zone.ownerId);
    markHiddenChanged({ ownerId: zone.ownerId, zoneId: zone.id });
    return { ok: true };
  }
  if (zone.type === ZONE.LIBRARY) {
    hidden.libraryOrder[zone.ownerId] = orderedCardIds;
    updatePlayerCounts(maps, hidden, zone.ownerId);
    syncLibraryRevealsToAllForPlayer(maps, hidden, zone.ownerId, zone.id);
    const player = readPlayer(maps, zone.ownerId);
    markHiddenChanged({
      ownerId: zone.ownerId,
      zoneId: zone.id,
      ...(player?.libraryTopReveal === "all" ? { reveal: { toAll: true } } : null),
    });
    return { ok: true };
  }
  if (zone.type === ZONE.SIDEBOARD) {
    hidden.sideboardOrder[zone.ownerId] = orderedCardIds;
    updatePlayerCounts(maps, hidden, zone.ownerId);
    markHiddenChanged({ ownerId: zone.ownerId, zoneId: zone.id });
    return { ok: true };
  }
  writeZone(maps, { ...zone, cardIds: orderedCardIds });
  return { ok: true };
};

export const zoneIntentHandlers: Record<string, IntentHandler> = {
  "zone.add": handleZoneAdd,
  "zone.reorder": handleZoneReorder,
};
