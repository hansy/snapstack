import { Card, CardId, PlayerId, ScryfallRelatedCard, Zone, ZoneId } from '../../../types';
import { getPlayerZones } from '../../../lib/gameSelectors';
import { ZONE, ZONE_LABEL } from '../../../constants/zones';
import { canCreateToken, canMoveCard, canTapCard, canViewZone } from '../../../rules/permissions';
import { getNextTransformFace, getTransformVerb, isTransformableCard } from '../../../lib/cardDisplay';

export type ContextMenuItem = ContextMenuAction | ContextMenuSeparator;

export interface ContextMenuAction {
    type: 'action';
    label: string;
    onSelect: () => void;
    danger?: boolean;
    submenu?: ContextMenuItem[];
    disabledReason?: string;
}

export interface ContextMenuSeparator {
    type: 'separator';
    id?: string;
}

export const buildZoneMoveActions = (
    card: Card,
    currentZone: Zone,
    allZones: Record<ZoneId, Zone>,
    actorId: PlayerId,
    moveCard: (cardId: CardId, toZoneId: ZoneId, opts?: { faceDown?: boolean }) => void,
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
            items.push({ type: 'action', label, onSelect: mover });
        }
    };

    if (currentZone.type === ZONE.LIBRARY) {
        if (library && moveCardToBottom) addIfAllowed(library, `Move to Bottom of ${ZONE_LABEL.library}`, () => moveCardToBottom(card.id, library.id));
        addIfAllowed(graveyard, `Move to ${ZONE_LABEL.graveyard}`, () => moveCard(card.id, graveyard!.id));
        addIfAllowed(exile, `Move to ${ZONE_LABEL.exile}`, () => moveCard(card.id, exile!.id));
        addIfAllowed(hand, `Move to ${ZONE_LABEL.hand}`, () => moveCard(card.id, hand!.id));
        if (battlefield) {
            addIfAllowed(battlefield, `Move to ${ZONE_LABEL.battlefield}`, () => moveCard(card.id, battlefield!.id));
            addIfAllowed(battlefield, `Play Facedown`, () => moveCard(card.id, battlefield!.id, { faceDown: true }));
        }
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
    moveCard: (cardId: CardId, toZoneId: ZoneId, position?: { x: number; y: number }, actorId?: PlayerId, isRemote?: boolean, opts?: { suppressLog?: boolean; faceDown?: boolean }) => void;
    tapCard: (cardId: CardId) => void;
    transformCard: (cardId: CardId, faceIndex?: number) => void;
    duplicateCard: (cardId: CardId) => void;
    createRelatedCard: (card: Card, related: ScryfallRelatedCard) => void;
    addCounter: (cardId: CardId, counter: { type: string; count: number; color?: string }) => void;
    removeCounter: (cardId: CardId, counterType: string) => void;
    removeCard?: (card: Card) => void;
    openAddCounterModal: (cardId: CardId) => void;
    globalCounters: Record<string, string>;
    updateCard?: (cardId: CardId, updates: Partial<Card>) => void;
}

export const buildCardActions = ({
    card,
    zones,
    myPlayerId,
    moveCard,
    tapCard,
    transformCard,
    duplicateCard,
    createRelatedCard,
    addCounter,
    removeCounter,
    removeCard,
    openAddCounterModal,
    globalCounters,
    updateCard,
}: CardActionBuilderParams): ContextMenuItem[] => {
    const items: ContextMenuItem[] = [];
    const currentZone = zones[card.zoneId];
    const countersAllowed = currentZone?.type === ZONE.BATTLEFIELD;

    const canTap = canTapCard({ actorId: myPlayerId }, card, currentZone);
    if (canTap.allowed) {
        items.push({ type: 'action', label: 'Tap/Untap', onSelect: () => tapCard(card.id) });
    }

    if (currentZone?.type === ZONE.BATTLEFIELD && isTransformableCard(card)) {
        const nextFace = getNextTransformFace(card);
        if (nextFace) {
            const verb = getTransformVerb(card);
            items.push({ type: 'action', label: `${verb}: ${nextFace.face.name}`, onSelect: () => transformCard(card.id, nextFace.nextIndex) });
        }
    }

    if (currentZone?.type === ZONE.BATTLEFIELD) {
        const tokenPermission = canCreateToken({ actorId: myPlayerId }, currentZone);
        if (tokenPermission.allowed) {
            items.push({ type: 'action', label: 'Duplicate', onSelect: () => duplicateCard(card.id) });
        }

        const relatedParts = (card.scryfall?.all_parts || []).filter(part => part.component !== 'combo_piece');
        if (relatedParts.length > 0) {
            const relatedItems: ContextMenuItem[] = relatedParts.map((part) => {
                const isToken = part.component === 'token';
                const label = `Create ${part.name}${isToken ? ' token' : ''}`;
                return { type: 'action', label, onSelect: () => createRelatedCard(card, part) };
            });

            if (relatedItems.length === 1) {
                items.push(relatedItems[0]);
            } else {
                items.push({ type: 'action', label: 'Create related', onSelect: () => { }, submenu: relatedItems });
            }
        }
    }

    if (countersAllowed) {
        // Add Counter Logic
        const globalCounterTypes = Object.keys(globalCounters).sort();

        if (globalCounterTypes.length === 0) {
            items.push({
                type: 'action',
                label: 'Add counter',
                onSelect: () => {
                    console.log('[Menu] Open add counter modal', { cardId: card.id });
                    openAddCounterModal(card.id);
                }
            });
        } else {
            const addCounterItems: ContextMenuItem[] = globalCounterTypes.map(counterType => ({
                type: 'action',
                label: counterType,
                onSelect: () => {
                    console.log('[Menu] Quick add counter', { cardId: card.id, counterType });
                    addCounter(card.id, {
                        type: counterType,
                        count: 1,
                        color: globalCounters[counterType]
                    });
                }
            }));

            addCounterItems.push({ type: 'separator', id: 'add-counter-divider' });
            addCounterItems.push({
                type: 'action',
                label: 'Create new...',
                onSelect: () => {
                    console.log('[Menu] Open add counter modal (submenu)', { cardId: card.id });
                    openAddCounterModal(card.id);
                }
            });

            items.push({
                type: 'action',
                label: 'Add counter',
                onSelect: () => { }, // Submenu parent
                submenu: addCounterItems
            });
        }

        // Remove Counter Logic
        if (card.counters.length > 0) {
            const removeCounterItems: ContextMenuItem[] = card.counters.map(counter => ({
                type: 'action',
                label: `${counter.type} (${counter.count})`,
                onSelect: () => removeCounter(card.id, counter.type)
            }));

            items.push({
                type: 'action',
                label: 'Remove counter',
                onSelect: () => { }, // Submenu parent
                submenu: removeCounterItems
            });
        }
    }

    if (card.isToken && removeCard) {
        items.push({ type: 'action', label: 'Remove Card', onSelect: () => removeCard(card), danger: true });
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
                items.push({ type: 'action', label: 'Play to Battlefield', onSelect: () => moveCard(card.id, playerZones.battlefield!.id) });
                items.push({ type: 'action', label: 'Play Facedown', onSelect: () => moveCard(card.id, playerZones.battlefield!.id, undefined, undefined, undefined, { faceDown: true }) });
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
                items.push({ type: 'action', label: 'Discard', onSelect: () => moveCard(card.id, playerZones.graveyard!.id), danger: true });
            }
        }
    }

    if (currentZone?.type === ZONE.BATTLEFIELD && card.faceDown) {
        items.push({
            type: 'action',
            label: 'Flip Face Up',
            onSelect: () => {
                if (updateCard) {
                    updateCard(card.id, { faceDown: false });
                }
            }
        });
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
    openCountPrompt?: (opts: { title: string; message: string; onSubmit: (count: number) => void }) => void;
}

export const buildZoneViewActions = ({
    zone,
    myPlayerId,
    onViewZone,
    drawCard,
    shuffleLibrary,
    resetDeck,
    unloadDeck,
    openCountPrompt,
}: ZoneActionBuilderParams): ContextMenuItem[] => {
    const items: ContextMenuItem[] = [];

    const viewAllPermission = canViewZone({ actorId: myPlayerId }, zone, { viewAll: true });
    if (!viewAllPermission.allowed && zone.type === ZONE.LIBRARY) {
        // Library actions are owner-only.
        return items;
    }

    if (zone.type === ZONE.LIBRARY) {
        if (zone.ownerId === myPlayerId) {
            items.push({ type: 'action', label: 'Draw Card', onSelect: () => drawCard(myPlayerId) });
            items.push({
                type: 'action',
                label: 'Draw X Cards...',
                onSelect: () => {
                    if (!openCountPrompt) return;
                    openCountPrompt({
                        title: 'Draw',
                        message: 'How many cards to draw?',
                        onSubmit: (count) => {
                            for (let i = 0; i < count; i++) {
                                drawCard(myPlayerId);
                            }
                        }
                    });
                },
                disabledReason: openCountPrompt ? undefined : 'Prompt unavailable',
            });
            items.push({ type: 'action', label: 'Shuffle Library', onSelect: () => shuffleLibrary(myPlayerId) });
            items.push({ type: 'action', label: 'Reset Deck', onSelect: () => resetDeck(myPlayerId) });
            items.push({ type: 'action', label: 'Unload Deck', onSelect: () => unloadDeck(myPlayerId), danger: true });
            if (onViewZone) items.push({ type: 'action', label: 'View All', onSelect: () => onViewZone(zone.id) });
            items.push({
                type: 'action',
                label: 'View Top X...',
                onSelect: () => {
                    if (!openCountPrompt || !onViewZone) return;
                    openCountPrompt({
                        title: 'View Top',
                        message: 'How many cards from top?',
                        onSubmit: (count) => onViewZone?.(zone.id, count),
                    });
                },
                disabledReason: openCountPrompt && onViewZone ? undefined : 'Prompt unavailable',
            });
        }
    } else if (zone.type === ZONE.GRAVEYARD || zone.type === ZONE.EXILE) {
        const viewPermission = canViewZone({ actorId: myPlayerId }, zone);
        if (viewPermission.allowed && onViewZone) items.push({ type: 'action', label: 'View All', onSelect: () => onViewZone(zone.id) });
    }

    return items;
};
