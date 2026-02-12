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
    cardBaseHeight?: number;
    cardBaseWidth?: number;
    mirrorY?: boolean;
    onContextMenu?: (e: React.MouseEvent) => void;
    onPointerDown?: (e: React.PointerEvent<HTMLDivElement>) => void;
    onPointerMove?: (e: React.PointerEvent<HTMLDivElement>) => void;
    onPointerUp?: (e: React.PointerEvent<HTMLDivElement>) => void;
    onPointerCancel?: (e: React.PointerEvent<HTMLDivElement>) => void;
    onPointerLeave?: (e: React.PointerEvent<HTMLDivElement>) => void;
    innerRef?: (node: HTMLDivElement | null) => void;
    disabled?: boolean;
}

const ZoneInner: React.FC<ZoneProps> = ({ zone, className, children, layout = 'stack', scale = 1, cardScale = 1, cardBaseHeight, cardBaseWidth, mirrorY = false, onContextMenu, onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onPointerLeave, innerRef, disabled = false }) => {
    const myPlayerId = useGameStore((state) => state.myPlayerId);
    const viewerRole = useGameStore((state) => state.viewerRole);

    const ghostCard = useDragStore((state) => {
        if (!state.ghostCards || state.ghostCards.length !== 1) return null;
        const [ghost] = state.ghostCards;
        return ghost.zoneId === zone.id ? ghost : null;
    });

    const ghostPosition = ghostCard?.position;
    const ghostTapped = ghostCard?.tapped;
    const ghostSize = ghostCard?.size;

    const { setNodeRef, isOver } = useDroppable({
        id: zone.id,
        disabled,
        data: {
            zoneId: zone.id,
            type: zone.type,
            layout,
            scale,
            cardScale,
            cardBaseHeight,
            cardBaseWidth,
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
        if (disabled) return false;
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
            role: viewerRole,
            card,
            fromZone,
            toZone: zone
        });

        return permission.allowed;
    }, [active?.id, active?.data.current?.cardId, disabled, isOver, myPlayerId, viewerRole, zone.id, zone.type, zone.ownerId]);

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
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
            onPointerLeave={onPointerLeave}
        >
            {children}
            {ghostPosition && (() => {
                const resolvedBaseHeight = cardBaseHeight ?? BASE_CARD_HEIGHT;
                const resolvedBaseWidth = cardBaseWidth ?? resolvedBaseHeight * CARD_ASPECT_RATIO;
                const fallbackGhostWidth = resolvedBaseWidth * cardScale;
                const fallbackGhostHeight = resolvedBaseHeight * cardScale;
                const ghostWidth = ghostSize?.width ?? fallbackGhostWidth;
                const ghostHeight = ghostSize?.height ?? fallbackGhostHeight;
                const shouldRotateGhost = Boolean(ghostTapped && !ghostSize);
                return (
                    <div
                        className="absolute pointer-events-none z-20"
                        style={{
                            width: ghostWidth,
                            height: ghostHeight,
                            left: ghostPosition.x - ghostWidth / 2,
                            top: ghostPosition.y - ghostHeight / 2,
                            transform: shouldRotateGhost ? 'rotate(90deg)' : undefined,
                            transformOrigin: 'center center'
                        }}
                    >
                        <div className="h-full w-full rounded-lg border border-indigo-300/80 bg-indigo-500/40 shadow-[0_0_0_1px_rgba(129,140,248,0.35),0_0_20px_rgba(99,102,241,0.28)]" />
                        <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-300/85 shadow-[0_0_10px_rgba(129,140,248,0.9)]" />
                    </div>
                );
            })()}
        </div>
    );
};

export const Zone = React.memo(ZoneInner);
