import { Card, CardId, PlayerId, Zone, ZoneId } from '../../../types';
import { getPlayerZones } from '../../../lib/gameSelectors';
import { ZONE, ZONE_LABEL } from '../../../constants/zones';
import { canMoveCard, canTapCard, canViewZone } from '../../../rules/permissions';

export interface ContextMenuItem {
    label: string;
    action: () => void;
    danger?: boolean;
}

export const buildZoneMoveActions = (
    card: Card,
    currentZone: Zone,
    allZones: Record<ZoneId, Zone>,
    actorId: PlayerId,
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

    const addIfAllowed = (targetZone: Zone | undefined, label: string, mover: () => void) => {
        if (!targetZone) return;
        const permission = canMoveCard({
            actorId,
            card,
            fromZone: currentZone,
            toZone: targetZone
        });
        if (permission.allowed) {
            items.push({ label, action: mover });
        }
    };

    if (currentZone.type === ZONE.LIBRARY) {
        if (library && moveCardToBottom) addIfAllowed(library, `Move to Bottom of ${ZONE_LABEL.library}`, () => moveCardToBottom(card.id, library.id));
        addIfAllowed(graveyard, `Move to ${ZONE_LABEL.graveyard}`, () => moveCard(card.id, graveyard!.id));
        addIfAllowed(exile, `Move to ${ZONE_LABEL.exile}`, () => moveCard(card.id, exile!.id));
        addIfAllowed(hand, `Move to ${ZONE_LABEL.hand}`, () => moveCard(card.id, hand!.id));
        addIfAllowed(battlefield, `Move to ${ZONE_LABEL.battlefield}`, () => moveCard(card.id, battlefield!.id));
    } else if (currentZone.type === ZONE.EXILE) {
        addIfAllowed(graveyard, `Move to ${ZONE_LABEL.graveyard}`, () => moveCard(card.id, graveyard!.id));
        addIfAllowed(hand, `Move to ${ZONE_LABEL.hand}`, () => moveCard(card.id, hand!.id));
        addIfAllowed(battlefield, `Move to ${ZONE_LABEL.battlefield}`, () => moveCard(card.id, battlefield!.id));
    } else if (currentZone.type === ZONE.GRAVEYARD) {
        addIfAllowed(exile, `Move to ${ZONE_LABEL.exile}`, () => moveCard(card.id, exile!.id));
        addIfAllowed(hand, `Move to ${ZONE_LABEL.hand}`, () => moveCard(card.id, hand!.id));
        addIfAllowed(battlefield, `Move to ${ZONE_LABEL.battlefield}`, () => moveCard(card.id, battlefield!.id));
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
    const items: ContextMenuItem[] = [];

    const canTap = canTapCard({ actorId: myPlayerId }, card);
    if (canTap.allowed) {
        items.push({ label: 'Tap/Untap', action: () => tapCard(card.id) });
    }

    items.push({ label: 'Add +1/+1 Counter', action: () => addCounter(card.id) });
    items.push({ label: 'Delete Card', action: () => deleteCard(card.id), danger: true });

    const playerZones = getPlayerZones(zones, myPlayerId);
    const currentZone = zones[card.zoneId];

    if (currentZone?.type === ZONE.HAND) {
        if (playerZones.battlefield) {
            const permission = canMoveCard({
                actorId: myPlayerId,
                card,
                fromZone: currentZone,
                toZone: playerZones.battlefield
            });
            if (permission.allowed) {
                items.push({ label: 'Play to Battlefield', action: () => moveCard(card.id, playerZones.battlefield!.id) });
            }
        }
        if (playerZones.graveyard) {
            const permission = canMoveCard({
                actorId: myPlayerId,
                card,
                fromZone: currentZone,
                toZone: playerZones.graveyard
            });
            if (permission.allowed) {
                items.push({ label: 'Discard', action: () => moveCard(card.id, playerZones.graveyard!.id), danger: true });
            }
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

    const viewAllPermission = canViewZone({ actorId: myPlayerId }, zone, { viewAll: true });
    if (!viewAllPermission.allowed && zone.type === ZONE.LIBRARY) {
        // Library actions are owner-only.
        return items;
    }

        if (zone.type === ZONE.LIBRARY) {
            if (zone.ownerId === myPlayerId) {
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
        }
    } else if (zone.type === ZONE.GRAVEYARD || zone.type === ZONE.EXILE) {
        const viewPermission = canViewZone({ actorId: myPlayerId }, zone);
        if (viewPermission.allowed && onViewZone) items.push({ label: 'View All', action: () => onViewZone(zone.id) });
    }

    return items;
};
