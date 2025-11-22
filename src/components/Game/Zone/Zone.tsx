import React from 'react';
import { useDroppable, useDndContext } from '@dnd-kit/core';
import { Zone as ZoneType } from '../../../types';
import { cn } from '../../../lib/utils';

interface ZoneProps {
    zone: ZoneType;
    className?: string;
    children?: React.ReactNode;
    layout?: 'stack' | 'fan' | 'grid' | 'free-form';
    scale?: number;
    ghostPosition?: { x: number; y: number };
    ghostTapped?: boolean;
}

export const Zone: React.FC<ZoneProps> = ({ zone, className, children, layout = 'stack', scale = 1, ghostPosition, ghostTapped }) => {
    const { setNodeRef, isOver } = useDroppable({
        id: zone.id,
        data: {
            zoneId: zone.id,
            type: zone.type,
            layout,
            scale,
        },
    });

    const { active } = useDndContext();

    const isValidDrop = React.useMemo(() => {
        if (!active || !isOver) return false;

        // Permission Check
        const cardOwnerId = active.data.current?.ownerId;
        const isBattlefield = zone.type === 'battlefield';
        const isOwner = zone.ownerId === cardOwnerId;

        return isBattlefield || isOwner;
    }, [active, isOver, zone.type, zone.ownerId]);

    return (
        <div
            ref={setNodeRef}
            data-zone-id={zone.id}
            className={cn(
                "transition-colors duration-200",
                isValidDrop && "bg-indigo-500/10 ring-2 ring-indigo-500/50",
                className
            )}
        >
            {children}
            {ghostPosition && (
                <div
                    className="absolute border-2 border-dashed border-indigo-400/50 bg-indigo-500/10 rounded-lg pointer-events-none z-0 transition-all duration-75"
                    style={{
                        width: 96,
                        height: 128,
                        transform: `translate3d(${ghostPosition.x}px, ${ghostPosition.y}px, 0)${ghostTapped ? ' rotate(90deg)' : ''}`,
                        transformOrigin: 'center center'
                    }}
                />
            )}
        </div>
    );
};
