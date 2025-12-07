import React from 'react';
import { useDroppable, useDndContext } from '@dnd-kit/core';
import { Zone as ZoneType } from '../../../types';
import { cn } from '../../../lib/utils';
import { BASE_CARD_HEIGHT, CARD_ASPECT_RATIO } from '../../../lib/constants';
import { useDragStore } from '../../../store/dragStore';

import { useGameStore } from '../../../store/gameStore';
import { canMoveCard } from '../../../rules/permissions';

interface ZoneProps {
    zone: ZoneType;
    className?: string;
    children?: React.ReactNode;
    layout?: 'stack' | 'fan' | 'grid' | 'free-form';
    scale?: number;
    cardScale?: number;
    onContextMenu?: (e: React.MouseEvent) => void;
    innerRef?: (node: HTMLDivElement | null) => void;
}

export const Zone: React.FC<ZoneProps> = ({ zone, className, children, layout = 'stack', scale = 1, cardScale = 1, onContextMenu, innerRef }) => {
    const cards = useGameStore((state) => state.cards);
    const zones = useGameStore((state) => state.zones);
    const myPlayerId = useGameStore((state) => state.myPlayerId);

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
        },
    });
    const setRefs = React.useCallback((node: HTMLDivElement | null) => {
        setNodeRef(node);
        innerRef?.(node);
    }, [innerRef, setNodeRef]);

    const { active } = useDndContext();

    const isValidDrop = React.useMemo(() => {
        if (!active || !isOver) return false;

        const cardId = active.data.current?.cardId as string | undefined;
        if (!cardId) return false;

        const card = cards[cardId];
        if (!card) return false;

        const fromZone = zones[card.zoneId];
        if (!fromZone) return false;

        const permission = canMoveCard({
            actorId: myPlayerId,
            card,
            fromZone,
            toZone: zone
        });

        return permission.allowed;
    }, [active, cards, isOver, myPlayerId, zone, zones]);

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
                            transform: `translate3d(${ghostPosition.x - ghostWidth / 2}px, ${ghostPosition.y - ghostHeight / 2}px, 0)${ghostTapped ? ' rotate(90deg)' : ''}`,
                            transformOrigin: 'center center'
                        }}
                    />
                );
            })()}
        </div>
    );
};
