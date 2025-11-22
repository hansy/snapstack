import React from 'react';
import {
    useSensor,
    useSensors,
    PointerSensor,
    DragEndEvent,
    DragMoveEvent
} from '@dnd-kit/core';
import { useGameStore } from '../store/gameStore';
import { getSnappedPosition } from '../lib/snapping';
import { ZoneId, CardId } from '../types';

// Logical (unrotated) card size in px. Tailwind h-32 = 128px; width from aspect 11/15 ≈ 94px.
const LOGICAL_CARD_HEIGHT = 128;
const LOGICAL_CARD_WIDTH = 94;

export const useGameDnD = () => {
    const cards = useGameStore((state) => state.cards);
    const zones = useGameStore((state) => state.zones);
    const moveCard = useGameStore((state) => state.moveCard);

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8,
            },
        })
    );

    const [ghostCard, setGhostCard] = React.useState<{ zoneId: string; position: { x: number; y: number }; tapped?: boolean } | null>(null);

    // Track pointer start and offset to the card's top-left to anchor drag math independent of rotation.
    const initialCardRect = React.useRef<{ left: number; top: number } | null>(null);

    const handleDragStart = (event: any) => {
        setGhostCard(null);

        const { active } = event;
        const activeRect = active.rect.current?.initial || active.rect.current?.translated;
        if (activeRect) {
            initialCardRect.current = {
                left: activeRect.left,
                top: activeRect.top
            };
        } else {
            initialCardRect.current = null;
        }
    };

    const handleDragMove = (event: DragMoveEvent) => {
        const { active, over } = event;

        if (!over) {
            setGhostCard(null);
            return;
        }

        const activeCardId = active.data.current?.cardId;
        const activeCard = cards[activeCardId];
        const isTapped = active.data.current?.tapped || activeCard?.tapped;

        // If over a battlefield zone, show ghost card
        if (over.data.current?.type === 'battlefield') {
            const zoneId = over.id as string;
            const targetZone = zones[zoneId];

            if (activeCard && targetZone) {
                // Permission Check:
                // 1. Battlefield: Always allowed
                // 2. Other: Only owner's zones (though this block is specifically for battlefield type check above)

                // Actually, the ghost card logic specifically checks `over.data.current.type === 'battlefield'`.
                // So we only need to check permissions if we want to restrict battlefield drops too (which we don't).
                // BUT, if we want to show ghost for other zones (future), we should check.
                // For now, the requirement says "any battlefield" is OK.
                // So ghost logic is fine as is for battlefield.

                // Wait, if I drag to an opponent's battlefield, it IS allowed.
                // So ghost should show.


                // Calculate position relative to the target zone using pointer + stored offset
                // @ts-ignore - over.rect is available at runtime
                const overRect = over.rect;
                const scale = over.data.current?.scale || 1;

                const initialRect = active.rect.current?.initial;
                if (overRect && initialRect) {
                    const topLeft = {
                        x: initialRect.left + event.delta.x,
                        y: initialRect.top + event.delta.y
                    };

                    const relativeX = (topLeft.x - overRect.left) / scale;
                    const relativeY = (topLeft.y - overRect.top) / scale;

                    // Snap to grid
                    const snappedPos = getSnappedPosition(relativeX, relativeY);

                    // Minimal debug: cursor (estimated center), ghost, start, and snapped end.
                    const cursorX = topLeft.x + (LOGICAL_CARD_WIDTH * scale) / 2;
                    const cursorY = topLeft.y + (LOGICAL_CARD_HEIGHT * scale) / 2;
                    const startPos = activeCard?.position || { x: 0, y: 0 };
                    console.log(
                        `🎯 move cursor=(${cursorX.toFixed(1)},${cursorY.toFixed(1)}) ` +
                        `ghost=(${snappedPos.x},${snappedPos.y}) ` +
                        `start=(${startPos.x},${startPos.y})`
                    );

                    setGhostCard({
                        zoneId,
                        position: snappedPos,
                        tapped: isTapped
                    });
                }
            }
        } else {
            setGhostCard(null);
        }
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        setGhostCard(null);

        if (over && active.id !== over.id) {
            const cardId = active.data.current?.cardId as CardId;
            const toZoneId = over.data.current?.zoneId as ZoneId;

            const activeCard = cards[cardId];
            const targetZone = zones[toZoneId];

            if (cardId && toZoneId && activeCard && targetZone) {
                // Permission Check
                const isBattlefield = targetZone.type === 'battlefield';
                const isOwner = targetZone.ownerId === activeCard.ownerId;

                if (!isBattlefield && !isOwner) {
                    console.warn('Permission denied: Cannot move card to this zone.');
                    return;
                }

                let position: { x: number; y: number } | undefined;

                // @ts-ignore - over.rect is available at runtime
                const overRect = over.rect;
                const scale = over.data.current?.scale || 1;

                const initialRect = active.rect.current?.initial;
                if (overRect && initialRect) {
                    const topLeft = {
                        x: initialRect.left + event.delta.x,
                        y: initialRect.top + event.delta.y
                    };

                    position = {
                        x: (topLeft.x - overRect.left) / scale,
                        y: (topLeft.y - overRect.top) / scale
                    };
                }

                moveCard(cardId, toZoneId, position);

                // Log start/end snapshots
                const startPos = activeCard.position;
                const endPos = position || startPos;
                console.log(
                    `🎯 drop start=(${startPos.x},${startPos.y}) end=(${endPos.x},${endPos.y})`
                );
            }
        }

        initialCardRect.current = null;
    };

    return {
        sensors,
        ghostCard,
        handleDragStart,
        handleDragMove,
        handleDragEnd
    };
};
