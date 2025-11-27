import React from 'react';
import { useGameStore } from '../store/gameStore';
import { ZoneId } from '../types';

export const useGameContextMenu = (myPlayerId: string, onViewZone?: (zoneId: ZoneId, count?: number) => void) => {
    const [contextMenu, setContextMenu] = React.useState<{ x: number; y: number; items: any[]; title?: string } | null>(null);
    const zones = useGameStore((state) => state.zones);
    const moveCard = useGameStore((state) => state.moveCard);

    const handleContextMenu = (e: React.MouseEvent, items: any[], title?: string) => {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY, items, title });
    };

    const closeContextMenu = () => setContextMenu(null);

    // Helper to find zones
    const findZone = (ownerId: string, type: string) => {
        return Object.values(zones).find(z => z.ownerId === ownerId && z.type === type);
    };

    const handleCardContextMenu = (e: React.MouseEvent, card: any) => {
        const items = [
            { label: 'Tap/Untap', action: () => useGameStore.getState().tapCard(card.id) },
            { label: 'Add +1/+1 Counter', action: () => useGameStore.getState().updateCard(card.id, { counters: [...card.counters, { type: 'p1p1', count: 1 }] }) },
            { label: 'Delete Card', action: () => useGameStore.getState().updateCard(card.id, { zoneId: 'exile' }), danger: true },
        ];

        if (card.zoneId.includes('hand')) {
            items.push(
                {
                    label: 'Play to Battlefield', action: () => {
                        const bf = findZone(myPlayerId, 'battlefield');
                        if (bf) moveCard(card.id, bf.id);
                    }
                },
                {
                    label: 'Discard', action: () => {
                        const gy = findZone(myPlayerId, 'graveyard');
                        if (gy) moveCard(card.id, gy.id);
                    }, danger: true
                }
            );
        }

        handleContextMenu(e, items, card.name);
    };

    const handleZoneContextMenu = (e: React.MouseEvent, zoneId: ZoneId) => {
        const zone = zones[zoneId];
        if (!zone) return;

        const items: any[] = [];

        if (zone.type === 'library') {
            items.push(
                { label: 'Draw Card', action: () => useGameStore.getState().drawCard(myPlayerId) },
                { label: 'Shuffle Library', action: () => useGameStore.getState().shuffleLibrary(myPlayerId) },
                { label: 'View All', action: () => onViewZone?.(zoneId) },
                {
                    label: 'View Top X...', action: () => {
                        const countStr = window.prompt("How many cards from top?");
                        if (countStr) {
                            const count = parseInt(countStr, 10);
                            if (!isNaN(count) && count > 0) {
                                onViewZone?.(zoneId, count);
                            }
                        }
                    }
                }
            );
        } else if (zone.type === 'graveyard' || zone.type === 'exile') {
            items.push(
                { label: 'View All', action: () => onViewZone?.(zoneId) }
            );
        }

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
