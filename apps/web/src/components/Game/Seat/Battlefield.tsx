import React from 'react';
import { cn } from '../../../lib/utils';
import { Zone as ZoneType, Card as CardType, Player } from '../../../types';
import { Card } from '../Card/Card';
import { Zone } from '../Zone/Zone';
import { BASE_CARD_HEIGHT, CARD_ASPECT_RATIO } from '../../../lib/constants';
import { useDragStore } from '../../../store/dragStore';
import { useGameStore } from '../../../store/gameStore';
import { fromNormalizedPosition, mirrorNormalizedY } from '../../../lib/positions';

interface BattlefieldProps {
    zone: ZoneType;
    cards: CardType[];
    player: Player;
    isTop: boolean;
    isMe?: boolean;
    mirrorForViewer?: boolean;
    scale?: number;
    viewScale?: number;
    onCardContextMenu?: (e: React.MouseEvent, card: CardType) => void;
    onContextMenu?: (e: React.MouseEvent) => void;
    showContextMenuCursor?: boolean;
}

export const Battlefield: React.FC<BattlefieldProps> = ({
    zone,
    cards,
    player,
    isTop,
    isMe,
    mirrorForViewer,
    scale = 1,
    viewScale = 1,
    onCardContextMenu,
    onContextMenu,
    showContextMenuCursor
}) => {
    const activeCardId = useDragStore((state) => state.activeCardId);
    const showGrid = Boolean(activeCardId);
    const GRID_SIZE = 30 * viewScale;
    const gridColor = 'rgba(148, 163, 184, 0.3)'; // zinc-400/30
    const zoneRef = React.useRef<HTMLDivElement | null>(null);
    const [zoneSize, setZoneSize] = React.useState<{ width: number; height: number }>({ width: 0, height: 0 });

    React.useEffect(() => {
        if (!zoneRef.current) return;
        const observer = new ResizeObserver((entries) => {
            const entry = entries[0];
            if (entry?.contentRect) {
                const { width, height } = entry.contentRect;
                setZoneSize({ width, height });
            }
        });
        observer.observe(zoneRef.current);
        return () => observer.disconnect();
    }, [zoneRef]);

    return (
        <div
            className={cn(
                "flex-1 relative",
                isTop ? "order-last" : "order-first",
                showContextMenuCursor && "cursor-context-menu"
            )}
            onContextMenu={onContextMenu}
        >
            <Zone
                zone={zone}
                className="w-full h-full relative"
                layout="free-form"
                scale={scale}
                cardScale={viewScale}
                mirrorY={mirrorForViewer}
                onContextMenu={onContextMenu}
                innerRef={(node) => {
                    zoneRef.current = node;
                }}
            >
                {showGrid && (
                    <div
                        className="pointer-events-none absolute inset-0 z-0"
                        style={{
                            backgroundImage: `radial-gradient(circle, ${gridColor} 2px, transparent 2px)`,
                            backgroundSize: `${GRID_SIZE}px ${GRID_SIZE}px`,
                            backgroundPosition: `-${GRID_SIZE / 2}px -${GRID_SIZE / 2}px`
                        }}
                    />
                )}
                {cards.map(card => {
                    const viewPosition = mirrorForViewer ? mirrorNormalizedY(card.position) : card.position;
                    const { x, y } = fromNormalizedPosition(viewPosition, zoneSize.width || 1, zoneSize.height || 1);
                    // Use BASE dimensions for positioning because Card applies scale with transformOrigin: center
                    // The scale transform will shrink the card around its center, keeping it at (x, y)
                    const baseWidth = BASE_CARD_HEIGHT * CARD_ASPECT_RATIO;
                    const baseHeight = BASE_CARD_HEIGHT;
                    const left = x - baseWidth / 2;
                    const top = y - baseHeight / 2;
                    return (
                        <Card
                            key={card.id}
                            card={card}
                            style={{
                                position: 'absolute',
                                left,
                                top,
                                transform: isTop ? 'rotate(180deg)' : undefined
                            }}
                            onContextMenu={(e) => {
                                e.stopPropagation();
                                onCardContextMenu?.(e, card);
                            }}
                            scale={viewScale}
                            rotateLabel={isTop}
                            faceDown={card.faceDown}
                        />
                    );
                })}
            </Zone>

            {/* Placeholder Text */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-5">
                <span className="text-4xl font-bold uppercase tracking-widest">{isMe ? 'Me' : player.name}</span>
            </div>

            {/* Zoom Edge Indicators */}
            {isMe && (
                <ZoomEdgeOverlay />
            )}
        </div>
    );
};

const ZoomEdgeOverlay = () => {
    const zoomEdge = useDragStore((state) => state.zoomEdge);
    const myPlayerId = useGameStore((state) => state.myPlayerId);
    const battlefieldViewScale = useGameStore((state) => state.battlefieldViewScale);

    if (!zoomEdge) return null;

    const currentScale = battlefieldViewScale[myPlayerId] ?? 1;
    const isZoomingIn = zoomEdge === 'top' || zoomEdge === 'left';
    const isZoomingOut = zoomEdge === 'bottom' || zoomEdge === 'right';

    const zoomPercentage = Math.round(currentScale * 100);

    // Check limits based on the displayed percentage to match user perception
    const isMaxedIn = zoomPercentage >= 100;
    const isMaxedOut = zoomPercentage <= 50;

    const showZoomingText = (isZoomingIn && !isMaxedIn) || (isZoomingOut && !isMaxedOut);

    return (
        <>
            <div className={cn(
                "absolute pointer-events-none z-50 transition-all duration-300",
                zoomEdge === 'top' && "top-0 left-0 right-0 h-32 bg-gradient-to-b from-indigo-500/50 to-transparent",
                zoomEdge === 'bottom' && "bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-indigo-500/50 to-transparent",
                zoomEdge === 'left' && "left-0 top-0 bottom-0 w-32 bg-gradient-to-r from-indigo-500/50 to-transparent",
                zoomEdge === 'right' && "right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-indigo-500/50 to-transparent",
            )} />

            <div className="absolute top-4 left-4 z-50 pointer-events-none bg-black/80 text-white px-4 py-2 rounded-md border border-white/10 shadow-xl backdrop-blur-sm flex flex-col gap-0.5">
                <span className="text-2xl font-bold font-mono text-indigo-400">{zoomPercentage}%</span>
                {showZoomingText && (
                    <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
                        Zooming {isZoomingIn ? 'in' : 'out'}...
                    </span>
                )}
            </div>
        </>
    );
};
