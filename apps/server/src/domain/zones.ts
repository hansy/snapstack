import type { Zone, ZoneType } from "../../../web/src/types/zones";

import { ZONE } from "./constants";
import { isCommanderZoneType } from "./cards";

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
