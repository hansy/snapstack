import React from 'react';
import { useGameStore } from '../store/gameStore';
import { Card, ZoneId } from '../types';
import { buildCardActions, buildZoneViewActions, ContextMenuItem } from '../components/Game/context/menu';

// Centralizes context menu state/handlers for cards and zones so UI components can stay lean.
export const useGameContextMenu = (myPlayerId: string, onViewZone?: (zoneId: ZoneId, count?: number) => void) => {
    const [contextMenu, setContextMenu] = React.useState<{ x: number; y: number; items: ContextMenuItem[]; title?: string } | null>(null);
    const zones = useGameStore((state) => state.zones);
    const moveCard = useGameStore((state) => state.moveCard);

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
            moveCard,
            tapCard: (cardId) => useGameStore.getState().tapCard(cardId),
            addCounter: (cardId) => {
                const { cards, updateCard } = useGameStore.getState();
                const existing = cards[cardId];
                const counters = existing ? [...existing.counters, { type: 'p1p1', count: 1 }] : [{ type: 'p1p1', count: 1 }];
                updateCard(cardId, { counters });
            },
            deleteCard: (cardId) => useGameStore.getState().updateCard(cardId, { zoneId: 'exile' }),
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
            drawCard: (playerId) => useGameStore.getState().drawCard(playerId),
            shuffleLibrary: (playerId) => useGameStore.getState().shuffleLibrary(playerId),
        });
        if (items.length > 0) {
            handleContextMenu(e, items);
        }
    };

    return {
        contextMenu,
        handleCardContextMenu,
        handleZoneContextMenu,
        closeContextMenu
    };
};
