import type { ZoneType } from "../types/zones";

export const ZONE = {
  LIBRARY: "library",
  HAND: "hand",
  BATTLEFIELD: "battlefield",
  GRAVEYARD: "graveyard",
  EXILE: "exile",
  COMMANDER: "commander",
  SIDEBOARD: "sideboard",
} as const satisfies Record<string, ZoneType>;

export const LEGACY_COMMAND_ZONE = "command" as const;

export const isHiddenZoneType = (zoneType: ZoneType | undefined) =>
  zoneType === ZONE.HAND || zoneType === ZONE.LIBRARY || zoneType === ZONE.SIDEBOARD;

export const isPublicZoneType = (zoneType: ZoneType | undefined) =>
  Boolean(zoneType) && !isHiddenZoneType(zoneType);

export const isCommanderZoneType = (zoneType: ZoneType | typeof LEGACY_COMMAND_ZONE) =>
  zoneType === ZONE.COMMANDER || zoneType === LEGACY_COMMAND_ZONE;
