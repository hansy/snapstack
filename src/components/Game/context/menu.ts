import { Card, CardId, PlayerId, Zone, ZoneId } from '../../../types';
import { getPlayerZones } from '../../../lib/gameSelectors';
import { ZONE, ZONE_LABEL } from '../../../constants/zones';

export interface ContextMenuItem {
    label: string;
    action: () => void;
    danger?: boolean;
}

export const buildZoneMoveActions = (
    card: Card,
    currentZone: Zone,
    allZones: Record<ZoneId, Zone>,
    moveCard: (cardId: CardId, toZoneId: ZoneId) => void,
    moveCardToBottom?: (cardId: CardId, toZoneId: ZoneId) => void
): ContextMenuItem[] => {
    const playerZones = getPlayerZones(allZones, currentZone.ownerId);
    const hand = playerZones.hand;
    const battlefield = playerZones.battlefield;
    const graveyard = playerZones.graveyard;
    const exile = playerZones.exile;
    const library = playerZones.library;

    const items: ContextMenuItem[] = [];

    if (currentZone.type === ZONE.LIBRARY) {
        if (library && moveCardToBottom) items.push({ label: `Move to Bottom of ${ZONE_LABEL.library}`, action: () => moveCardToBottom(card.id, library.id) });
        if (graveyard) items.push({ label: `Move to ${ZONE_LABEL.graveyard}`, action: () => moveCard(card.id, graveyard.id) });
        if (exile) items.push({ label: `Move to ${ZONE_LABEL.exile}`, action: () => moveCard(card.id, exile.id) });
        if (hand) items.push({ label: `Move to ${ZONE_LABEL.hand}`, action: () => moveCard(card.id, hand.id) });
        if (battlefield) items.push({ label: `Move to ${ZONE_LABEL.battlefield}`, action: () => moveCard(card.id, battlefield.id) });
    } else if (currentZone.type === ZONE.EXILE) {
        if (graveyard) items.push({ label: `Move to ${ZONE_LABEL.graveyard}`, action: () => moveCard(card.id, graveyard.id) });
        if (hand) items.push({ label: `Move to ${ZONE_LABEL.hand}`, action: () => moveCard(card.id, hand.id) });
        if (battlefield) items.push({ label: `Move to ${ZONE_LABEL.battlefield}`, action: () => moveCard(card.id, battlefield.id) });
    } else if (currentZone.type === ZONE.GRAVEYARD) {
        if (exile) items.push({ label: `Move to ${ZONE_LABEL.exile}`, action: () => moveCard(card.id, exile.id) });
        if (hand) items.push({ label: `Move to ${ZONE_LABEL.hand}`, action: () => moveCard(card.id, hand.id) });
        if (battlefield) items.push({ label: `Move to ${ZONE_LABEL.battlefield}`, action: () => moveCard(card.id, battlefield.id) });
    }

    return items;
};

interface CardActionBuilderParams {
    card: Card;
    zones: Record<ZoneId, Zone>;
    myPlayerId: PlayerId;
    moveCard: (cardId: CardId, toZoneId: ZoneId) => void;
    tapCard: (cardId: CardId) => void;
    addCounter: (cardId: CardId) => void;
    deleteCard: (cardId: CardId) => void;
}

export const buildCardActions = ({
    card,
    zones,
    myPlayerId,
    moveCard,
    tapCard,
    addCounter,
    deleteCard,
}: CardActionBuilderParams): ContextMenuItem[] => {
    const items: ContextMenuItem[] = [
        { label: 'Tap/Untap', action: () => tapCard(card.id) },
        { label: 'Add +1/+1 Counter', action: () => addCounter(card.id) },
        { label: 'Delete Card', action: () => deleteCard(card.id), danger: true },
    ];

    const playerZones = getPlayerZones(zones, myPlayerId);
    const currentZone = zones[card.zoneId];

    if (currentZone?.type === ZONE.HAND) {
        if (playerZones.battlefield) {
            items.push({ label: 'Play to Battlefield', action: () => moveCard(card.id, playerZones.battlefield!.id) });
        }
        if (playerZones.graveyard) {
            items.push({ label: 'Discard', action: () => moveCard(card.id, playerZones.graveyard!.id), danger: true });
        }
    }

    return items;
};

interface ZoneActionBuilderParams {
    zone: Zone;
    myPlayerId: PlayerId;
    onViewZone?: (zoneId: ZoneId, count?: number) => void;
    drawCard: (playerId: PlayerId) => void;
    shuffleLibrary: (playerId: PlayerId) => void;
}

export const buildZoneViewActions = ({
    zone,
    myPlayerId,
    onViewZone,
    drawCard,
    shuffleLibrary,
}: ZoneActionBuilderParams): ContextMenuItem[] => {
    const items: ContextMenuItem[] = [];

    if (zone.type === ZONE.LIBRARY) {
        items.push({ label: 'Draw Card', action: () => drawCard(myPlayerId) });
        items.push({ label: 'Shuffle Library', action: () => shuffleLibrary(myPlayerId) });
        if (onViewZone) items.push({ label: 'View All', action: () => onViewZone(zone.id) });
        items.push({
            label: 'View Top X...',
            action: () => {
                const countStr = window.prompt('How many cards from top?');
                if (!countStr) return;
                const count = parseInt(countStr, 10);
                if (!isNaN(count) && count > 0) {
                    onViewZone?.(zone.id, count);
                }
            }
        });
    } else if (zone.type === ZONE.GRAVEYARD || zone.type === ZONE.EXILE) {
        if (onViewZone) items.push({ label: 'View All', action: () => onViewZone(zone.id) });
    }

    return items;
};
