import { Card, CardId, PlayerId, Zone, ZoneId, ZoneType } from '../types';
import { ZONE } from '../constants/zones';

// Returns the first zone for a player that matches a given type.
const LEGACY_COMMAND = 'command' as const;

export const getZoneByType = (
    zones: Record<ZoneId, Zone>,
    ownerId: PlayerId,
    type: ZoneType
): Zone | undefined => {
    return Object.values(zones).find((zone) => {
        if (zone.ownerId !== ownerId) return false;
        const zoneType = (zone as any).type as string;
        // Support legacy 'command' type persisted before renaming to 'commander'.
        if (type === ZONE.COMMANDER && (zoneType === 'commander' || zoneType === LEGACY_COMMAND)) return true;
        return zoneType === type;
    });
};

// Convenience accessor for all standard zones for a player.
export const getPlayerZones = (
    zones: Record<ZoneId, Zone>,
    ownerId: PlayerId
): Partial<Record<ZoneType, Zone>> => ({
    library: getZoneByType(zones, ownerId, ZONE.LIBRARY),
    hand: getZoneByType(zones, ownerId, ZONE.HAND),
    battlefield: getZoneByType(zones, ownerId, ZONE.BATTLEFIELD),
    graveyard: getZoneByType(zones, ownerId, ZONE.GRAVEYARD),
    exile: getZoneByType(zones, ownerId, ZONE.EXILE),
    commander: getZoneByType(zones, ownerId, ZONE.COMMANDER),
});

// Returns ordered card objects for a zone, filtering out any missing references.
export const getCardsInZone = (cards: Record<CardId, Card>, zone?: Zone) => {
    if (!zone) return [] as Card[];
    return zone.cardIds.map((id) => cards[id]).filter(Boolean);
};
