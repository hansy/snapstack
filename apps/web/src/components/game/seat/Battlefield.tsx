import React from 'react';
import { cn } from '@/lib/utils';
import { Zone as ZoneType, Card as CardType, Player } from '@/types';
import { Card } from '../card/Card';
import { CardView } from '../card/CardView';
import { Zone } from '../zone/Zone';
import { useDragStore } from '@/store/dragStore';
import { useGameStore } from '@/store/gameStore';
import { useSelectionStore } from '@/store/selectionStore';
import { computeBattlefieldCardLayout } from '@/models/game/seat/battlefieldModel';
import { useElementSize } from "@/hooks/shared/useElementSize";
import { fromNormalizedPosition, mirrorNormalizedY } from "@/lib/positions";
import { getEffectiveCardSize } from "@/lib/dndBattlefield";
import { BASE_CARD_HEIGHT, CARD_ASPECT_RATIO } from "@/lib/constants";
import { getFlipRotation } from "@/lib/cardDisplay";

interface BattlefieldProps {
    zone: ZoneType;
    cards: CardType[];
    player: Player;
    isTop: boolean;
    isMe?: boolean;
    viewerPlayerId: string;
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
    viewerPlayerId: string;
    mirrorForViewer?: boolean;
    viewScale: number;
    onCardContextMenu?: (e: React.MouseEvent, card: CardType) => void;
    playerColors: Record<string, string>;
    zoneOwnerId: string;
    overrideIsDragging?: boolean;
    disableInteractions?: boolean;
}>(
    ({
        card,
        zoneWidth,
        zoneHeight,
        viewerPlayerId,
        mirrorForViewer,
        viewScale,
        onCardContextMenu,
        playerColors,
        zoneOwnerId,
        overrideIsDragging,
        disableInteractions,
    }) => {
        const { left, top, highlightColor, disableDrag } = computeBattlefieldCardLayout({
            card,
            zoneOwnerId,
            viewerPlayerId,
            zoneWidth,
            zoneHeight,
            mirrorForViewer,
            playerColors,
        });
        const isSelected = useSelectionStore((state) =>
            state.selectionZoneId === card.zoneId && state.selectedCardIds.includes(card.id)
        );

        const style = React.useMemo(() => ({
            position: 'absolute' as const,
            left,
            top,
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
                isSelected={isSelected}
                isDragging={overrideIsDragging}
                disableDrag={disableDrag}
                disableInteractions={disableInteractions}
            />
        );
    }
);

BattlefieldCard.displayName = 'BattlefieldCard';

const BattlefieldInner: React.FC<BattlefieldProps> = ({
    zone,
    cards,
    player,
    isTop,
    isMe,
    viewerPlayerId,
    mirrorForViewer,
    scale = 1,
    viewScale = 1,
    onCardContextMenu,
    onContextMenu,
    showContextMenuCursor,
    playerColors
}) => {
    const activeCardId = useDragStore((state) => state.activeCardId);
    const ghostCards = useDragStore((state) => state.ghostCards);
    const isGroupDragging = useDragStore((state) => state.isGroupDragging);
    const showGrid = Boolean(activeCardId);
    const GRID_SIZE = 30 * viewScale;
    const gridColor = 'rgba(148, 163, 184, 0.3)'; // zinc-400/30
    const cardsById = useGameStore((state) => state.cards);
    const { ref: zoneSizeRef, size: zoneSize } = useElementSize<HTMLDivElement>();
    const zoneNodeRef = React.useRef<HTMLDivElement | null>(null);
    const setZoneRef = React.useCallback((node: HTMLDivElement | null) => {
        zoneSizeRef(node);
        zoneNodeRef.current = node;
    }, [zoneSizeRef]);
    const isSelectionEnabled = Boolean(isMe && zone.ownerId === viewerPlayerId);
    const setSelection = useSelectionStore((state) => state.setSelection);
    const selectedCardIds = useSelectionStore((state) => state.selectedCardIds);
    const selectionZoneId = useSelectionStore((state) => state.selectionZoneId);
    const [selectionRect, setSelectionRect] = React.useState<{
        x: number;
        y: number;
        width: number;
        height: number;
    } | null>(null);
    const selectionDragRef = React.useRef<{
        pointerId: number;
        start: { x: number; y: number };
        baseSelection: Set<string>;
        shiftKey: boolean;
    } | null>(null);

    const clampRectToZone = React.useCallback((rect: {
        x: number;
        y: number;
        width: number;
        height: number;
    }) => {
        const maxWidth = zoneSize.width;
        const maxHeight = zoneSize.height;
        if (!maxWidth || !maxHeight) return rect;

        const left = Math.max(0, Math.min(rect.x, maxWidth));
        const top = Math.max(0, Math.min(rect.y, maxHeight));
        const right = Math.max(0, Math.min(rect.x + rect.width, maxWidth));
        const bottom = Math.max(0, Math.min(rect.y + rect.height, maxHeight));

        return {
            x: left,
            y: top,
            width: Math.max(0, right - left),
            height: Math.max(0, bottom - top),
        };
    }, [zoneSize.height, zoneSize.width]);

    const getSelectionRect = React.useCallback((start: { x: number; y: number }, current: { x: number; y: number }) => {
        const left = Math.min(start.x, current.x);
        const top = Math.min(start.y, current.y);
        const width = Math.abs(current.x - start.x);
        const height = Math.abs(current.y - start.y);
        return clampRectToZone({ x: left, y: top, width, height });
    }, [clampRectToZone]);

    const getIdsInRect = React.useCallback((rect: { x: number; y: number; width: number; height: number }) => {
        if (!zoneSize.width || !zoneSize.height) return [];
        const left = rect.x;
        const right = rect.x + rect.width;
        const top = rect.y;
        const bottom = rect.y + rect.height;

        const ids: string[] = [];
        cards.forEach((card) => {
            const viewPosition = mirrorForViewer ? mirrorNormalizedY(card.position) : card.position;
            const center = fromNormalizedPosition(viewPosition, zoneSize.width, zoneSize.height);
            const { cardWidth, cardHeight } = getEffectiveCardSize({
                viewScale,
                isTapped: card.tapped,
            });
            const cardLeft = center.x - cardWidth / 2;
            const cardTop = center.y - cardHeight / 2;
            const cardRight = cardLeft + cardWidth;
            const cardBottom = cardTop + cardHeight;

            const intersects =
                right >= cardLeft &&
                left <= cardRight &&
                bottom >= cardTop &&
                top <= cardBottom;
            if (intersects) ids.push(card.id);
        });
        return ids;
    }, [cards, mirrorForViewer, viewScale, zoneSize.height, zoneSize.width]);

    const toggleSelection = React.useCallback((baseSelection: Set<string>, ids: string[]) => {
        const next = new Set(baseSelection);
        ids.forEach((id) => {
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
        });
        return Array.from(next);
    }, []);

    const getLocalPoint = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
        const node = zoneNodeRef.current;
        if (!node) return null;
        const rect = node.getBoundingClientRect();
        const safeScale = scale || 1;
        return {
            x: (event.clientX - rect.left) / safeScale,
            y: (event.clientY - rect.top) / safeScale,
        };
    }, [scale]);

    const handlePointerDown = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
        if (!isSelectionEnabled) return;
        if (event.button !== 0) return;
        if (event.target instanceof HTMLElement && event.target.closest('[data-card-id]')) return;

        const localPoint = getLocalPoint(event);
        if (!localPoint) return;

        const selectionState = useSelectionStore.getState();
        const baseSelection =
            selectionState.selectionZoneId === zone.id ? selectionState.selectedCardIds : [];

        selectionDragRef.current = {
            pointerId: event.pointerId,
            start: localPoint,
            baseSelection: new Set(baseSelection),
            shiftKey: event.shiftKey,
        };
        zoneNodeRef.current?.setPointerCapture(event.pointerId);
        setSelectionRect({ x: localPoint.x, y: localPoint.y, width: 0, height: 0 });
    }, [getLocalPoint, isSelectionEnabled, zone.id]);

    const updateSelectionFromEvent = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
        const selection = selectionDragRef.current;
        if (!selection || selection.pointerId !== event.pointerId) return;

        const localPoint = getLocalPoint(event);
        if (!localPoint) return;

        const rect = getSelectionRect(selection.start, localPoint);
        setSelectionRect(rect);

        const idsInRect = getIdsInRect(rect);
        const nextIds = selection.shiftKey
            ? toggleSelection(selection.baseSelection, idsInRect)
            : idsInRect;
        setSelection(nextIds, zone.id);
    }, [getIdsInRect, getLocalPoint, getSelectionRect, setSelection, toggleSelection, zone.id]);

    const handlePointerMove = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
        updateSelectionFromEvent(event);
    }, [updateSelectionFromEvent]);

    const handlePointerUp = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
        if (!selectionDragRef.current || selectionDragRef.current.pointerId !== event.pointerId) return;

        updateSelectionFromEvent(event);
        zoneNodeRef.current?.releasePointerCapture(event.pointerId);
        selectionDragRef.current = null;
        setSelectionRect(null);
    }, [updateSelectionFromEvent]);

    const handlePointerCancel = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
        if (!selectionDragRef.current || selectionDragRef.current.pointerId !== event.pointerId) return;
        zoneNodeRef.current?.releasePointerCapture(event.pointerId);
        selectionDragRef.current = null;
        setSelectionRect(null);
    }, []);

    const groupGhostForZone = React.useMemo(() => {
        if (!ghostCards || ghostCards.length < 2) return [];
        return ghostCards.filter((ghost) => ghost.zoneId === zone.id);
    }, [ghostCards, zone.id]);
    const ghostCardsForZone = React.useMemo(() => {
        if (groupGhostForZone.length === 0) return [];
        return groupGhostForZone
            .map((ghost) => {
                const card = cardsById[ghost.cardId];
                if (!card) return null;
                return { card, position: ghost.position, tapped: ghost.tapped ?? card.tapped };
            })
            .filter((value): value is { card: CardType; position: { x: number; y: number }; tapped: boolean } => Boolean(value));
    }, [cardsById, groupGhostForZone]);
    const hideSelectedForGroupDrag = Boolean(
        isGroupDragging &&
        selectionZoneId === zone.id
    );

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
                innerRef={setZoneRef}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerCancel}
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
                {selectionRect && (
                    <div
                        className="pointer-events-none absolute z-10 border border-indigo-400/70 bg-indigo-400/10"
                        style={{
                            left: selectionRect.x,
                            top: selectionRect.y,
                            width: selectionRect.width,
                            height: selectionRect.height,
                        }}
                    />
                )}
                {cards.map(card => (
                    <BattlefieldCard
                        key={card.id}
                        card={card}
                        zoneWidth={zoneSize.width}
                        zoneHeight={zoneSize.height}
                        viewerPlayerId={viewerPlayerId}
                        mirrorForViewer={mirrorForViewer}
                        viewScale={viewScale}
                        onCardContextMenu={onCardContextMenu}
                        playerColors={playerColors}
                        zoneOwnerId={zone.ownerId}
                        overrideIsDragging={
                            hideSelectedForGroupDrag && selectedCardIds.includes(card.id)
                                ? true
                                : undefined
                        }
                        disableInteractions={
                            isGroupDragging &&
                            selectionZoneId === zone.id &&
                            selectedCardIds.includes(card.id)
                        }
                    />
                ))}
                {ghostCardsForZone.map(({ card, position, tapped }) => {
                    const baseWidth = BASE_CARD_HEIGHT * CARD_ASPECT_RATIO;
                    const baseHeight = BASE_CARD_HEIGHT;
                    const transformParts = [`scale(${viewScale})`];
                    if (tapped) transformParts.push("rotate(90deg)");
                    const flipRotation = getFlipRotation(card);
                    const highlightColor =
                        card.ownerId !== zone.ownerId ? playerColors[card.ownerId] : undefined;

                    return (
                        <CardView
                            key={`ghost-${card.id}`}
                            card={card}
                            style={{
                                position: "absolute",
                                left: position.x - baseWidth / 2,
                                top: position.y - baseHeight / 2,
                                transform: transformParts.join(" "),
                                transformOrigin: "center center",
                            }}
                            className="pointer-events-none opacity-80 z-10"
                            faceDown={card.faceDown}
                            imageTransform={flipRotation ? `rotate(${flipRotation}deg)` : undefined}
                            highlightColor={highlightColor}
                            isSelected={selectedCardIds.includes(card.id)}
                            disableHoverAnimation
                        />
                    );
                })}
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
