import React from 'react';
import { useDroppable, useDndContext } from '@dnd-kit/core';
import { Zone as ZoneType } from '@/types';
import { cn } from '@/lib/utils';
import { BASE_CARD_HEIGHT, CARD_ASPECT_RATIO } from '@/lib/constants';
import { useDragStore } from '@/store/dragStore';

import { useGameStore } from '@/store/gameStore';
import { canMoveCard } from '@/rules/permissions';

interface ZoneProps {
    zone: ZoneType;
    className?: string;
    children?: React.ReactNode;
    layout?: 'stack' | 'fan' | 'grid' | 'free-form';
    scale?: number;
    cardScale?: number;
    mirrorY?: boolean;
    onContextMenu?: (e: React.MouseEvent) => void;
    innerRef?: (node: HTMLDivElement | null) => void;
}

const ZoneInner: React.FC<ZoneProps> = ({ zone, className, children, layout = 'stack', scale = 1, cardScale = 1, mirrorY = false, onContextMenu, innerRef }) => {
    const myPlayerId = useGameStore((state) => state.myPlayerId);

    // Only subscribe to the ghost card for THIS zone
    const ghostState = useDragStore((state) => {
        if (state.ghostCard?.zoneId === zone.id) {
            return state.ghostCard;
        }
        return null;
    });

    const ghostPosition = ghostState?.position;
    const ghostTapped = ghostState?.tapped;

    const { setNodeRef, isOver } = useDroppable({
        id: zone.id,
        data: {
            zoneId: zone.id,
            type: zone.type,
            layout,
            scale,
            cardScale,
            mirrorY,
        },
    });
    const setRefs = React.useCallback((node: HTMLDivElement | null) => {
        setNodeRef(node);
        innerRef?.(node);
    }, [innerRef, setNodeRef]);

    const { active } = useDndContext();

    // Optimized: only check validity when dragging over this zone
    const isValidDrop = React.useMemo(() => {
        if (!active || !isOver) return false;

        const cardId = active.data.current?.cardId as string | undefined;
        if (!cardId) return false;

        // Get card and zone data directly from store to avoid stale references
        const state = useGameStore.getState();
        const card = state.cards[cardId];
        if (!card) return false;

        const fromZone = state.zones[card.zoneId];
        if (!fromZone) return false;

        const permission = canMoveCard({
            actorId: myPlayerId,
            card,
            fromZone,
            toZone: zone
        });

        return permission.allowed;
    }, [active?.id, active?.data.current?.cardId, isOver, myPlayerId, zone.id, zone.type, zone.ownerId]);

    return (
        <div
            ref={setRefs}
            data-zone-id={zone.id}
            className={cn(
                "transition-colors duration-200",
                isValidDrop && "bg-indigo-500/10 ring-2 ring-indigo-500/50",
                className
            )}
            onContextMenu={onContextMenu}
        >
            {children}
            {ghostPosition && (() => {
                const ghostWidth = BASE_CARD_HEIGHT * CARD_ASPECT_RATIO * cardScale;
                const ghostHeight = BASE_CARD_HEIGHT * cardScale;
                return (
                    <div
                        className="absolute bg-indigo-500/40 rounded-lg pointer-events-none z-0"
                        style={{
                            width: ghostWidth,
                            height: ghostHeight,
                            left: ghostPosition.x - ghostWidth / 2,
                            top: ghostPosition.y - ghostHeight / 2,
                            transform: ghostTapped ? 'rotate(90deg)' : undefined,
                            transformOrigin: 'center center'
                        }}
                    />
                );
            })()}
        </div>
    );
};

export const Zone = React.memo(ZoneInner);
