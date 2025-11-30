import { Card, CardId, PlayerId, Zone, ZoneId } from '../../../types';
import { getPlayerZones } from '../../../lib/gameSelectors';
import { ZONE, ZONE_LABEL } from '../../../constants/zones';
import { canCreateToken, canMoveCard, canTapCard, canViewZone } from '../../../rules/permissions';

export interface ContextMenuItem {
    label: string;
    action: () => void;
    danger?: boolean;
    submenu?: ContextMenuItem[];
    separator?: boolean;
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
    duplicateCard: (cardId: CardId) => void;
    addCounter: (cardId: CardId, counter: { type: string; count: number; color?: string }) => void;
    removeCounter: (cardId: CardId, counterType: string) => void;
    removeCard?: (card: Card) => void;
    openAddCounterModal: (cardId: CardId) => void;
    globalCounters: Record<string, string>;
}

export const buildCardActions = ({
    card,
    zones,
    myPlayerId,
    moveCard,
    tapCard,
    duplicateCard,
    addCounter,
    removeCounter,
    removeCard,
    openAddCounterModal,
    globalCounters,
}: CardActionBuilderParams): ContextMenuItem[] => {
    const items: ContextMenuItem[] = [];
    const currentZone = zones[card.zoneId];
    const countersAllowed = currentZone?.type === ZONE.BATTLEFIELD;

    const canTap = canTapCard({ actorId: myPlayerId }, card, currentZone);
    if (canTap.allowed) {
        items.push({ label: 'Tap/Untap', action: () => tapCard(card.id) });
    }

    if (currentZone?.type === ZONE.BATTLEFIELD) {
        const tokenPermission = canCreateToken({ actorId: myPlayerId }, currentZone);
        if (tokenPermission.allowed) {
            items.push({ label: 'Duplicate', action: () => duplicateCard(card.id) });
        }
    }

    if (countersAllowed) {
        // Add Counter Logic
        const globalCounterTypes = Object.keys(globalCounters).sort();

        if (globalCounterTypes.length === 0) {
            items.push({ label: 'Add counter', action: () => openAddCounterModal(card.id) });
        } else {
            const addCounterItems: ContextMenuItem[] = globalCounterTypes.map(counterType => ({
                label: counterType,
                action: () => addCounter(card.id, {
                    type: counterType,
                    count: 1,
                    color: globalCounters[counterType]
                })
            }));

            addCounterItems.push({ label: '', action: () => { }, separator: true });
            addCounterItems.push({ label: 'Create new...', action: () => openAddCounterModal(card.id) });

            items.push({
                label: 'Add counter',
                action: () => { }, // Submenu parent
                submenu: addCounterItems
            });
        }

        // Remove Counter Logic
        if (card.counters.length > 0) {
            const removeCounterItems: ContextMenuItem[] = card.counters.map(counter => ({
                label: `${counter.type} (${counter.count})`,
                action: () => removeCounter(card.id, counter.type)
            }));

            items.push({
                label: 'Remove counter',
                action: () => { }, // Submenu parent
                submenu: removeCounterItems
            });
        }
    }

    if (card.isToken && removeCard) {
        items.push({ label: 'Remove Card', action: () => removeCard(card), danger: true });
    }

    const playerZones = getPlayerZones(zones, myPlayerId);

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
    resetDeck: (playerId: PlayerId) => void;
    unloadDeck: (playerId: PlayerId) => void;
}

export const buildZoneViewActions = ({
    zone,
    myPlayerId,
    onViewZone,
    drawCard,
    shuffleLibrary,
    resetDeck,
    unloadDeck,
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
            items.push({
                label: 'Draw X Cards...',
                action: () => {
                    const countStr = window.prompt('How many cards to draw?');
                    if (!countStr) return;
                    const count = parseInt(countStr, 10);
                    if (!isNaN(count) && count > 0) {
                        for (let i = 0; i < count; i++) {
                            drawCard(myPlayerId);
                        }
                    }
                }
            });
            items.push({ label: 'Shuffle Library', action: () => shuffleLibrary(myPlayerId) });
            items.push({ label: 'Reset Deck', action: () => resetDeck(myPlayerId) });
            items.push({ label: 'Unload Deck', action: () => unloadDeck(myPlayerId), danger: true });
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
