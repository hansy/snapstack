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
    playerColors: Record<string, string>;
}

// Memoized card wrapper to prevent unnecessary re-renders
const BattlefieldCard = React.memo<{
    card: CardType;
    zoneWidth: number;
    zoneHeight: number;
    mirrorForViewer?: boolean;
    viewScale: number;
    onCardContextMenu?: (e: React.MouseEvent, card: CardType) => void;
    playerColors: Record<string, string>;
    zoneOwnerId: string;
}>(({ card, zoneWidth, zoneHeight, mirrorForViewer, viewScale, onCardContextMenu, playerColors, zoneOwnerId }) => {
    const viewPosition = mirrorForViewer ? mirrorNormalizedY(card.position) : card.position;
    const { x, y } = fromNormalizedPosition(viewPosition, zoneWidth || 1, zoneHeight || 1);
    const baseWidth = BASE_CARD_HEIGHT * CARD_ASPECT_RATIO;
    const baseHeight = BASE_CARD_HEIGHT;
    const left = x - baseWidth / 2;
    const top = y - baseHeight / 2;

    const myPlayerId = useGameStore((state) => state.myPlayerId);

    // Highlight if card is owned by someone else AND not on their battlefield (which is implied if it's on THIS battlefield and owner != zoneOwner)
    // Actually simpler: if card.ownerId != zoneOwnerId, it's a foreign card on this battlefield. 
    // Requirement: "cards controlled by others when NOT on their battlefield to be lightly highlighted by their color"
    // Interpretation: "controlled by others" -> "owned by others" (based on example). 
    // Example: "I am red, I give my card to someone else". That card is on someone else's board. Owner=Me(Red), ZoneOwner=Them. 
    // Highlight Color = My Color (Red).
    const highlightColor = card.ownerId !== zoneOwnerId ? playerColors[card.ownerId] : undefined;

    // Disable drag if I don't control the card
    const isController = card.controllerId === myPlayerId;

    const style = React.useMemo(() => ({
        position: 'absolute' as const,
        left,
        top
    }), [left, top]);

    const handleContextMenu = React.useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        onCardContextMenu?.(e, card);
    }, [onCardContextMenu, card]);

    return (
        <Card
            card={card}
            style={style}
            onContextMenu={handleContextMenu}
            scale={viewScale}
            faceDown={card.faceDown}
            highlightColor={highlightColor}
            disableDrag={!isController}
        />
    );
});

BattlefieldCard.displayName = 'BattlefieldCard';

const BattlefieldInner: React.FC<BattlefieldProps> = ({
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
    showContextMenuCursor,
    playerColors
}) => {
    const activeCardId = useDragStore((state) => state.activeCardId);
    const showGrid = Boolean(activeCardId);
    const GRID_SIZE = 30 * viewScale;
    const gridColor = 'rgba(148, 163, 184, 0.3)'; // zinc-400/30
    const zoneRef = React.useRef<HTMLDivElement | null>(null);
    const [zoneSize, setZoneSize] = React.useState<{ width: number; height: number }>({ width: 0, height: 0 });

    // Debounced resize handler to avoid excessive state updates
    const resizeTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    React.useEffect(() => {
        if (!zoneRef.current) return;
        const observer = new ResizeObserver((entries) => {
            const entry = entries[0];
            if (entry?.contentRect) {
                const { width, height } = entry.contentRect;
                // Debounce resize updates
                if (resizeTimeoutRef.current) {
                    clearTimeout(resizeTimeoutRef.current);
                }
                resizeTimeoutRef.current = setTimeout(() => {
                    setZoneSize((prev) => {
                        // Only update if changed significantly (> 1px)
                        if (Math.abs(prev.width - width) > 1 || Math.abs(prev.height - height) > 1) {
                            return { width, height };
                        }
                        return prev;
                    });
                }, 16);
            }
        });
        observer.observe(zoneRef.current);
        return () => {
            observer.disconnect();
            if (resizeTimeoutRef.current) {
                clearTimeout(resizeTimeoutRef.current);
            }
        };
    }, []);

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
                {cards.map(card => (
                    <BattlefieldCard
                        key={card.id}
                        card={card}
                        zoneWidth={zoneSize.width}
                        zoneHeight={zoneSize.height}
                        mirrorForViewer={mirrorForViewer}
                        viewScale={viewScale}
                        onCardContextMenu={onCardContextMenu}
                        playerColors={playerColors}
                        zoneOwnerId={zone.ownerId}
                    />
                ))}
            </Zone>

            {/* Placeholder Text */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-5">
                <span className="text-4xl font-bold uppercase tracking-widest">{player.name || (isMe ? 'Me' : '')}</span>
            </div>

            {/* Zoom Edge Indicators */}
            {isMe && (
                <ZoomEdgeOverlay />
            )}
        </div>
    );
};

export const Battlefield = React.memo(BattlefieldInner);

const ZoomEdgeOverlay = React.memo(() => {
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
});

ZoomEdgeOverlay.displayName = 'ZoomEdgeOverlay';
