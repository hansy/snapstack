import React from 'react';
import { cn } from '@/lib/utils';
import { Zone as ZoneType, Card as CardType, Player, ViewerRole } from '@/types';
import { Card } from '../card/Card';
import { Zone } from '../zone/Zone';
import { useDragStore } from '@/store/dragStore';
import { useGameStore } from '@/store/gameStore';
import { useSelectionStore } from '@/store/selectionStore';
import { computeBattlefieldCardLayout } from '@/models/game/seat/battlefieldModel';
import { getCardPixelSize } from '@/lib/positions';
import { useElementSize } from "@/hooks/shared/useElementSize";
import { useBattlefieldZoomControls } from "@/hooks/game/board/useBattlefieldZoomControls";
import { useBattlefieldSelection } from "@/hooks/game/board/useBattlefieldSelection";
import { BattlefieldGridOverlay } from "./BattlefieldGridOverlay";
import { BattlefieldGhostOverlay } from "./BattlefieldGhostOverlay";

interface BattlefieldProps {
    zone: ZoneType;
    cards: CardType[];
    player: Player;
    isTop: boolean;
    isMe?: boolean;
    viewerPlayerId: string;
    viewerRole?: ViewerRole;
    mirrorBattlefieldY: boolean;
    scale?: number;
    viewScale?: number;
    baseCardHeight?: number;
    baseCardWidth?: number;
    onCardContextMenu?: (e: React.MouseEvent, card: CardType) => void;
    onContextMenu?: (e: React.MouseEvent) => void;
    showContextMenuCursor?: boolean;
    playerColors: Record<string, string>;
    disableZoomControls?: boolean;
}

// Memoized card wrapper to prevent unnecessary re-renders
const BattlefieldCard = React.memo<{
    card: CardType;
    zoneWidth: number;
    zoneHeight: number;
    viewerPlayerId: string;
    viewerRole?: ViewerRole;
    mirrorBattlefieldY: boolean;
    viewScale: number;
    baseCardHeight?: number;
    baseCardWidth?: number;
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
        viewerRole,
        mirrorBattlefieldY,
        viewScale,
        baseCardHeight,
        baseCardWidth,
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
            mirrorBattlefieldY,
            playerColors,
            baseCardHeight,
            baseCardWidth,
        });
        const spectatorDragDisabled = viewerRole === "spectator";
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
                disableDrag={disableDrag || spectatorDragDisabled}
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
    viewerRole,
    mirrorBattlefieldY,
    scale = 1,
    viewScale = 1,
    baseCardHeight,
    baseCardWidth,
    onCardContextMenu,
    onContextMenu,
    showContextMenuCursor,
    playerColors,
    disableZoomControls,
}) => {
    const activeCardId = useDragStore((state) => state.activeCardId);
    const ghostCards = useDragStore((state) => state.ghostCards);
    const isGroupDragging = useDragStore((state) => state.isGroupDragging);
    const showGrid = Boolean(activeCardId);
    const cardsById = useGameStore((state) => state.cards);
    const activeCard = activeCardId ? cardsById[activeCardId] : undefined;
    const { cardWidth, cardHeight } = getCardPixelSize({
        viewScale,
        isTapped: Boolean(activeCard?.tapped),
        baseCardHeight,
        baseCardWidth,
    });
    const gridStepX = cardWidth / 2;
    const gridStepY = cardHeight / 4;
    const { ref: zoneSizeRef, size: zoneSize } = useElementSize<HTMLDivElement>();
    const zoneNodeRef = React.useRef<HTMLDivElement | null>(null);
    const [zoneNode, setZoneNode] = React.useState<HTMLDivElement | null>(null);
    const setBattlefieldGridSizing = useGameStore(
        (state) => state.setBattlefieldGridSizing
    );
    const setZoneRef = React.useCallback((node: HTMLDivElement | null) => {
        zoneSizeRef(node);
        zoneNodeRef.current = node;
        setZoneNode(node);
    }, [zoneSizeRef]);
    const isSelectionEnabled = Boolean(isMe && zone.ownerId === viewerPlayerId);
    const selectedCardIds = useSelectionStore((state) => state.selectedCardIds);
    const selectionZoneId = useSelectionStore((state) => state.selectionZoneId);
    const { cardWidth: baseCardWidthPx, cardHeight: baseCardHeightPx } = getCardPixelSize({
        viewScale: 1,
        isTapped: false,
        baseCardHeight,
        baseCardWidth,
    });

    React.useEffect(() => {
        if (!zoneSize.height) {
            setBattlefieldGridSizing(zone.ownerId, null);
            return;
        }
        setBattlefieldGridSizing(zone.ownerId, {
            zoneHeightPx: zoneSize.height,
            baseCardHeightPx,
            baseCardWidthPx,
            viewScale,
        });
        return () => {
            setBattlefieldGridSizing(zone.ownerId, null);
        };
    }, [
        baseCardHeightPx,
        baseCardWidthPx,
        setBattlefieldGridSizing,
        viewScale,
        zone.ownerId,
        zoneSize.height,
    ]);

    useBattlefieldZoomControls({
        playerId: viewerPlayerId,
        enabled: Boolean(isMe),
        wheelTarget: zoneNode,
        isBlocked: disableZoomControls,
    });

    const {
        selectionRect,
        handlePointerDown,
        handlePointerMove,
        handlePointerUp,
        handlePointerCancel,
    } = useBattlefieldSelection({
        zoneId: zone.id,
        cards,
        zoneSize,
        scale,
        viewScale,
        baseCardHeight,
        baseCardWidth,
        mirrorBattlefieldY,
        zoneNodeRef,
        isSelectionEnabled,
    });

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
                cardBaseHeight={baseCardHeight}
                cardBaseWidth={baseCardWidth}
                mirrorY={mirrorBattlefieldY}
                onContextMenu={onContextMenu}
                innerRef={setZoneRef}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerCancel}
            >
                <BattlefieldGridOverlay visible={showGrid} gridStepX={gridStepX} gridStepY={gridStepY} />
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
                        viewerRole={viewerRole}
                        mirrorBattlefieldY={mirrorBattlefieldY}
                        viewScale={viewScale}
                        baseCardHeight={baseCardHeight}
                        baseCardWidth={baseCardWidth}
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
                    <BattlefieldGhostOverlay
                        ghostCards={ghostCardsForZone}
                        viewScale={viewScale}
                        baseCardHeight={baseCardHeight}
                        baseCardWidth={baseCardWidth}
                        zoneOwnerId={zone.ownerId}
                        playerColors={playerColors}
                        selectedCardIds={selectedCardIds}
                    />
            </Zone>

            {/* Placeholder Text */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-5">
                <span className="text-4xl font-bold uppercase tracking-widest">{player.name || (isMe ? 'Me' : '')}</span>
            </div>

        </div>
    );
};

export const Battlefield = React.memo(BattlefieldInner);
