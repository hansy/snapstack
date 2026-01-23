import type { LogContext, LogEventId, LogMessage, LogMessagePart } from "@/logging/types";
import { getCardDisplayName } from "@/logging/helpers";
import type { Zone } from "@/types";

const HIDDEN_ZONE_TYPES = new Set(["hand", "library"]);

export type LogCardContext = {
  fromZone?: Zone;
  toZone?: Zone;
  fromZoneType?: string;
  toZoneType?: string;
  cardName?: string;
  forceHidden?: boolean;
  nameOverride?: string;
};

const isLogEvent = <K extends LogEventId>(
  entry: LogMessage,
  eventId: K
): entry is LogMessage<K> => entry.eventId === eventId;

export const resolveLogCardContext = (
  entry: LogMessage,
  ctx: LogContext
): LogCardContext => {
  if (isLogEvent(entry, "card.move") && entry.payload) {
    return {
      fromZone: ctx.zones[entry.payload.fromZoneId],
      toZone: ctx.zones[entry.payload.toZoneId],
      fromZoneType: entry.payload.fromZoneType,
      toZoneType: entry.payload.toZoneType,
      cardName: entry.payload.cardName,
      forceHidden: entry.payload.forceHidden ?? entry.payload.faceDown,
    };
  }

  if (isLogEvent(entry, "card.transform") && entry.payload) {
    const zone = entry.payload.zoneId ? ctx.zones[entry.payload.zoneId] : undefined;
    return {
      fromZone: zone,
      toZone: zone,
      cardName: entry.payload.cardName,
      nameOverride: entry.payload.fromFaceName,
    };
  }

  if (
    (isLogEvent(entry, "card.tap") ||
      isLogEvent(entry, "card.faceUp") ||
      isLogEvent(entry, "card.duplicate") ||
      isLogEvent(entry, "card.remove") ||
      isLogEvent(entry, "card.pt") ||
      isLogEvent(entry, "player.commanderTax") ||
      isLogEvent(entry, "counter.add") ||
      isLogEvent(entry, "counter.remove")) &&
    entry.payload
  ) {
    const zone = entry.payload.zoneId ? ctx.zones[entry.payload.zoneId] : undefined;
    return {
      fromZone: zone,
      toZone: zone,
      cardName: entry.payload.cardName,
    };
  }

  return {};
};

export const resolveLogCardDisplayName = (params: {
  part: LogMessagePart;
  logContext: LogContext;
  cardContext: LogCardContext;
}): string => {
  if (params.part.kind !== "card") return params.part.text;

  if (params.cardContext.nameOverride) {
    return params.cardContext.nameOverride;
  }

  if (params.cardContext.forceHidden) {
    return params.cardContext.cardName ?? "a card";
  }

  if (params.part.cardId) {
    const fromZone = params.cardContext.fromZone;
    const toZone = params.cardContext.toZone;
    const fallbackName = params.cardContext.cardName;

    const computed = getCardDisplayName(
      params.logContext,
      params.part.cardId,
      fromZone,
      toZone,
      fallbackName
    );

    const visibleName = computeVisibleCardName({
      computedName: computed,
      fallbackName,
      fromZoneType: fromZone?.type ?? params.cardContext.fromZoneType,
      toZoneType: toZone?.type ?? params.cardContext.toZoneType,
    });

    return visibleName || params.part.text;
  }

  if (params.cardContext.cardName) {
    return params.cardContext.cardName;
  }

  return params.part.text;
};

export const getBorderColorClass = (color?: string) => {
  switch (color) {
    case "rose":
      return "border-rose-500/50";
    case "violet":
      return "border-violet-500/50";
    case "sky":
      return "border-sky-500/50";
    case "amber":
      return "border-amber-500/50";
    case "emerald":
      return "border-emerald-500/50";
    default:
      return "border-zinc-700/50";
  }
};

export const formatTimeAgo = (timestamp: number, nowMs: number = Date.now()): string => {
  const seconds = Math.floor((nowMs - timestamp) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return "long ago";
};

export const isPublicZoneType = (zoneType?: string): boolean => {
  if (!zoneType) return false;
  return !HIDDEN_ZONE_TYPES.has(zoneType);
};

export const computeVisibleCardName = (params: {
  computedName: string;
  fallbackName?: string;
  fromZoneType?: string;
  toZoneType?: string;
}): string => {
  if (params.computedName !== "a card") return params.computedName;

  const fromPublic = isPublicZoneType(params.fromZoneType);
  const toPublic = isPublicZoneType(params.toZoneType);
  if (params.fallbackName && (fromPublic || toPublic)) return params.fallbackName;

  return params.computedName;
};
