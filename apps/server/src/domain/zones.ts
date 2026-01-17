import type { Zone, ZoneType } from "../../../web/src/types/zones";

import { ZONE } from "./constants";
import { isCommanderZoneType } from "./cards";
import type { Maps } from "./types";
import { readRecord, readZone } from "./yjsStore";

export const findZoneByType = (
  zones: Record<string, Zone>,
  playerId: string,
  zoneType: ZoneType
): Zone | null => {
  const match = Object.values(zones).find(
    (zone) =>
      zone.ownerId === playerId &&
      (zoneType === ZONE.COMMANDER
        ? isCommanderZoneType(zone.type)
        : zone.type === zoneType)
  );
  return match ? { ...match } : null;
};

export const findZoneByTypeInMaps = (
  maps: Maps,
  playerId: string,
  zoneType: ZoneType
): Zone | null => {
  let matchId: string | null = null;
  maps.zones.forEach((value, key) => {
    if (matchId) return;
    const raw = readRecord(value);
    if (!raw) return;
    const zone = raw as unknown as Zone;
    if (zone.ownerId !== playerId) return;
    const matches =
      zoneType === ZONE.COMMANDER
        ? isCommanderZoneType(zone.type)
        : zone.type === zoneType;
    if (!matches) return;
    matchId = String(key);
  });
  if (!matchId) return null;
  return readZone(maps, matchId);
};
