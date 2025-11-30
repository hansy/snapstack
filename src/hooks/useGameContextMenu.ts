import React from 'react';
import { useGameStore } from '../store/gameStore';
import { Card, ZoneId } from '../types';
import { buildCardActions, buildZoneViewActions, ContextMenuItem } from '../components/Game/context/menu';

// Centralizes context menu state/handlers for cards and zones so UI components can stay lean.
export const useGameContextMenu = (myPlayerId: string, onViewZone?: (zoneId: ZoneId, count?: number) => void) => {
    const [contextMenu, setContextMenu] = React.useState<{ x: number; y: number; items: ContextMenuItem[]; title?: string } | null>(null);
    const zones = useGameStore((state) => state.zones);
    const moveCard = useGameStore((state) => state.moveCard);
    const duplicateCard = useGameStore((state) => state.duplicateCard);

    // Opens a context menu at the event point with provided actions.
    const handleContextMenu = (e: React.MouseEvent, items: ContextMenuItem[], title?: string) => {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY, items, title });
    };

    const closeContextMenu = () => setContextMenu(null);

    // Builds and opens card-specific actions (tap, counters, move shortcuts).
    const handleCardContextMenu = (e: React.MouseEvent, card: Card) => {
        const cardActions = buildCardActions({
            card,
            zones,
            myPlayerId,
            moveCard: (cardId, toZoneId) => moveCard(cardId, toZoneId, undefined, myPlayerId),
            tapCard: (cardId) => useGameStore.getState().tapCard(cardId, myPlayerId),
            duplicateCard: (cardId) => duplicateCard(cardId, myPlayerId),
            addCounter: (cardId, counter) => {
                useGameStore.getState().addCounterToCard(cardId, counter);
            },
            removeCounter: (cardId, counterType) => {
                useGameStore.getState().removeCounterFromCard(cardId, counterType);
            },
            openAddCounterModal: (cardId) => {
                useGameStore.getState().setActiveModal({ type: 'ADD_COUNTER', cardId });
            },
            globalCounters: useGameStore.getState().globalCounters,
            removeCard: (targetCard) => {
                useGameStore.getState().removeCard(targetCard.id, myPlayerId);
            },
        });

        handleContextMenu(e, cardActions, card.name);
    };

    // Builds and opens zone-specific actions (draw/shuffle/view).
    const handleZoneContextMenu = (e: React.MouseEvent, zoneId: ZoneId) => {
        const zone = zones[zoneId];
        if (!zone) return;

        const items = buildZoneViewActions({
            zone,
            myPlayerId,
            onViewZone,
            drawCard: (playerId) => useGameStore.getState().drawCard(playerId, myPlayerId),
            shuffleLibrary: (playerId) => useGameStore.getState().shuffleLibrary(playerId, myPlayerId),
            resetDeck: (playerId) => useGameStore.getState().resetDeck(playerId, myPlayerId),
            unloadDeck: (playerId) => useGameStore.getState().unloadDeck(playerId, myPlayerId),
        });
        if (items.length > 0) {
            handleContextMenu(e, items);
        }
    };

    const handleBattlefieldContextMenu = (e: React.MouseEvent, onCreateToken: () => void) => {
        handleContextMenu(e, [
            {
                label: 'Create Token',
                action: onCreateToken,
            }
        ]);
    };

    return {
        contextMenu,
        handleCardContextMenu,
        handleZoneContextMenu,
        handleBattlefieldContextMenu,
        closeContextMenu
    };
};
