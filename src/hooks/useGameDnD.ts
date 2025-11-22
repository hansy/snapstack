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

                const translatedRect = active.rect.current?.translated;
                const baseRect = translatedRect || initialCardRect.current || active.rect.current?.initial;
                if (overRect && baseRect) {
                    const topLeft = translatedRect
                        ? { x: translatedRect.left, y: translatedRect.top }
                        : {
                            x: baseRect.left + event.delta.x,
                            y: baseRect.top + event.delta.y
                        };

                    const relativeX = (topLeft.x - overRect.left) / scale;
                    const relativeY = (topLeft.y - overRect.top) / scale;

                    // Snap to grid
                    const snappedPos = getSnappedPosition(relativeX, relativeY);

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

                const translatedRect = active.rect.current?.translated;
                const baseRect = translatedRect || initialCardRect.current || active.rect.current?.initial;
                if (overRect && baseRect) {
                    const topLeft = translatedRect
                        ? { x: translatedRect.left, y: translatedRect.top }
                        : {
                            x: baseRect.left + event.delta.x,
                            y: baseRect.top + event.delta.y
                        };

                    position = {
                        x: (topLeft.x - overRect.left) / scale,
                        y: (topLeft.y - overRect.top) / scale
                    };
                }

                moveCard(cardId, toZoneId, position);
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
