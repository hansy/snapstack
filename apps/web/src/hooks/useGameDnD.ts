import React from 'react';
import {
    useSensor,
    useSensors,
    PointerSensor,
    DragEndEvent,
    DragMoveEvent,
    DragStartEvent
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { useGameStore } from '../store/gameStore';
import { useDragStore } from '../store/dragStore';
import { ZoneId, CardId } from '../types';
import {
    getEventCoordinates,
    calculatePointerOffset,
    DragPosition,
    DragOffset
} from '../lib/dnd';
import { BASE_CARD_HEIGHT, CARD_ASPECT_RATIO } from '../lib/constants';
import { ZONE } from '../constants/zones';
import { canMoveCard } from '../rules/permissions';
import { fromNormalizedPosition, snapNormalizedWithZone, toNormalizedPosition } from '../lib/positions';

export const useGameDnD = () => {
    const cards = useGameStore((state) => state.cards);
    const zones = useGameStore((state) => state.zones);
    const moveCard = useGameStore((state) => state.moveCard);
    const setGhostCard = useDragStore((state) => state.setGhostCard);
    const setActiveCardId = useDragStore((state) => state.setActiveCardId);
    const setOverCardScale = useDragStore((state) => state.setOverCardScale);
    const setZoomEdge = useDragStore((state) => state.setZoomEdge);
    const myPlayerId = useGameStore((state) => state.myPlayerId);

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8,
            },
        })
    );

    // Track pointer start and offset to card center so positioning follows the cursor.
    const dragPointerStart = React.useRef<DragPosition | null>(null);
    const dragPointerToCenter = React.useRef<DragOffset>({ x: 0, y: 0 });
    const startGhostPos = React.useRef<DragPosition | null>(null);
    const lastGhostPos = React.useRef<DragPosition | null>(null);
    const cardRectRef = React.useRef<DOMRect | null>(null);
    const dragSeq = React.useRef(0);
    const currentDragSeq = React.useRef<number | null>(null);

    const handleDragStart = (event: DragStartEvent) => {
        currentDragSeq.current = ++dragSeq.current;

        setGhostCard(null);
        dragMoveLogged.current = false;
        startGhostPos.current = null;
        lastGhostPos.current = null;
        if (event.active.data.current?.cardId) {
            setActiveCardId(event.active.data.current.cardId);
        }

        const { active, activatorEvent } = event as any;
        // @ts-ignore - rect is available on active
        const activeRect = active.rect.current?.initial || active.rect.current?.translated;

        // Prefer a live measurement of the draggable node to capture transforms (rotation/scale).
        const nodeRect = active.data.current?.nodeRef?.current?.getBoundingClientRect?.();
        const targetRect = activatorEvent?.target?.getBoundingClientRect?.();
        const rect = nodeRect || targetRect || activeRect || null;
        cardRectRef.current = rect;

        const pointer = getEventCoordinates(event);

        // Fallback to card center if we couldn't read the pointer (keeps the ghost anchored).
        const center = rect
            ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
            : null;

        dragPointerStart.current = pointer || center;

        if (center && pointer && rect) {
            dragPointerToCenter.current = calculatePointerOffset(pointer, rect);
        } else {
            dragPointerToCenter.current = { x: 0, y: 0 };
        }

    };

    const dragMoveLogged = React.useRef(false);
    const startLogged = React.useRef(false);

    const handleDragMove = (event: DragMoveEvent) => {
        if (currentDragSeq.current == null) {
            // Late move after drag has ended; ignore to avoid resurrecting ghosts
            return;
        }

        const { active, over } = event;

        if (!over) {
            setGhostCard(null);
            setOverCardScale(1);
            return;
        }

        const activeCardId = active.data.current?.cardId;
        const activeCard = cards[activeCardId];
        const isTapped = active.data.current?.tapped || activeCard?.tapped;

        // If over a battlefield zone, show ghost card
        if (over.data.current?.type === ZONE.BATTLEFIELD) {
            const zoneId = over.id as string;
            const targetZone = zones[zoneId];
            const fromZone = activeCard ? zones[activeCard.zoneId] : undefined;

            if (activeCard && targetZone && fromZone) {
                const permission = canMoveCard({
                    actorId: myPlayerId,
                    card: activeCard,
                    fromZone,
                    toZone: targetZone
                });
                if (!permission.allowed) {
                    setGhostCard(null);
                    return;
                }

                // @ts-ignore - over.rect is available at runtime
                const overRect = over.rect as any;
                const scale = over.data.current?.scale || 1;
                const viewScale = over.data.current?.cardScale || 1;
                setOverCardScale(viewScale);

                // Use the translated rect center for accurate position
                // This correctly handles scroll offsets in the source container
                // @ts-ignore - active.rect.current.translated is available at runtime
                const activeRect = active.rect.current?.translated;
                if (!activeRect) return;

                const centerScreen = {
                    x: activeRect.left + activeRect.width / 2,
                    y: activeRect.top + activeRect.height / 2,
                };

                const unsnappedPos = {
                    x: (centerScreen.x - overRect.left) / scale,
                    y: (centerScreen.y - overRect.top) / scale,
                };

                const zoneWidth = (overRect?.width || 0) / scale;
                const zoneHeight = (overRect?.height || 0) / scale;

                const baseWidth = BASE_CARD_HEIGHT * CARD_ASPECT_RATIO;
                const cardWidth = (isTapped ? BASE_CARD_HEIGHT : baseWidth) * viewScale;
                const cardHeight = (isTapped ? baseWidth : BASE_CARD_HEIGHT) * viewScale;

                // Clamp the position to zone bounds (instead of rejecting)
                // This is more forgiving and handles scroll offset issues
                const clampedPos = {
                    x: Math.max(cardWidth / 2, Math.min(unsnappedPos.x, zoneWidth - cardWidth / 2)),
                    y: Math.max(cardHeight / 2, Math.min(unsnappedPos.y, zoneHeight - cardHeight / 2))
                };

                const unsnappedNormalized = toNormalizedPosition(clampedPos, zoneWidth, zoneHeight);
                const snappedNormalized = snapNormalizedWithZone(
                    unsnappedNormalized,
                    zoneWidth,
                    zoneHeight,
                    cardWidth,
                    cardHeight
                );
                const ghostPosition = fromNormalizedPosition(snappedNormalized, zoneWidth, zoneHeight);

                setGhostCard({
                    zoneId,
                    position: ghostPosition,
                    tapped: isTapped
                });
                if (!dragMoveLogged.current) {
                    startGhostPos.current = ghostPosition;
                    dragMoveLogged.current = true;
                }
                lastGhostPos.current = ghostPosition;

                // One-time per drag anchor tracking (kept for potential future use)
                if (!startLogged.current) {
                    startLogged.current = true;
                }
            }
        } else {
            setGhostCard(null);
            setOverCardScale(1);
        }

        // Edge Detection for Zoom
        if (over && over.data.current?.type === ZONE.BATTLEFIELD) {
            const zoneId = over.id as string;
            const targetZone = zones[zoneId];
            // Only allow zoom on OWN battlefield
            if (targetZone && targetZone.ownerId === myPlayerId) {
                // @ts-ignore - rect is available on active
                const activeRect = active.rect.current?.translated;
                // @ts-ignore - rect is available on over
                const overRect = over.rect;

                if (activeRect && overRect) {
                    const EDGE_THRESHOLD = 30; // px

                    let edge: 'top' | 'bottom' | 'left' | 'right' | null = null;

                    if (activeRect.top < overRect.top + EDGE_THRESHOLD) edge = 'top';
                    else if (activeRect.bottom > overRect.bottom - EDGE_THRESHOLD) edge = 'bottom';
                    else if (activeRect.left < overRect.left + EDGE_THRESHOLD) edge = 'left';
                    else if (activeRect.right > overRect.right - EDGE_THRESHOLD) edge = 'right';

                    setZoomEdge(edge);
                } else {
                    setZoomEdge(null);
                }
            } else {
                setZoomEdge(null);
            }
        } else {
            setZoomEdge(null);
        }
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        setGhostCard(null);
        setActiveCardId(null);
        setOverCardScale(1);
        setZoomEdge(null);

        if (over && active.id !== over.id) {
            const cardId = active.data.current?.cardId as CardId;
            const toZoneId = over.data.current?.zoneId as ZoneId;

            const activeCard = cards[cardId];
            const targetZone = zones[toZoneId];
            const fromZone = activeCard ? zones[activeCard.zoneId] : undefined;

            // Handle Reordering in Hand
            if (fromZone && targetZone && fromZone.id === targetZone.id && targetZone.type === ZONE.HAND) {
                const overCardId = over.data.current?.cardId;
                if (overCardId && cardId !== overCardId) {
                    const oldIndex = targetZone.cardIds.indexOf(cardId);
                    const newIndex = targetZone.cardIds.indexOf(overCardId);
                    if (oldIndex !== -1 && newIndex !== -1) {
                        const newOrder = arrayMove(targetZone.cardIds, oldIndex, newIndex);
                        useGameStore.getState().reorderZoneCards(targetZone.id, newOrder, myPlayerId);
                    }
                }
                return;
            }

            if (cardId && toZoneId && activeCard && targetZone && fromZone) {
                const permission = canMoveCard({
                    actorId: myPlayerId,
                    card: activeCard,
                    fromZone,
                    toZone: targetZone
                });
                if (!permission.allowed) {
                    console.warn(permission.reason || 'Permission denied: Cannot move card to this zone.');
                    return;
                }

                // Non-battlefield zones ignore geometry/size so cards can always be dropped to the owner's zones.
                if (targetZone.type !== ZONE.BATTLEFIELD) {
                    moveCard(cardId, toZoneId, undefined, myPlayerId);
                    return;
                }

                // Battlefield keeps positional logic and bounds clamping.
                // @ts-ignore - over.rect is available at runtime
                const overRect = over.rect as any;
                const scale = over.data.current?.scale || 1;
                const viewScale = over.data.current?.cardScale || 1;

                // Use the translated rect center for accurate position
                // This correctly handles scroll offsets in the source container
                // @ts-ignore - active.rect.current.translated is available at runtime
                const activeRect = active.rect.current?.translated;
                if (!activeRect) return;

                const centerScreen = {
                    x: activeRect.left + activeRect.width / 2,
                    y: activeRect.top + activeRect.height / 2,
                };

                const unsnappedPos = {
                    x: (centerScreen.x - overRect.left) / scale,
                    y: (centerScreen.y - overRect.top) / scale,
                };

                const zoneWidth = (overRect?.width || 0) / scale;
                const zoneHeight = (overRect?.height || 0) / scale;

                const isTapped = active.data.current?.tapped || activeCard?.tapped;
                const baseWidth = BASE_CARD_HEIGHT * CARD_ASPECT_RATIO;
                const cardWidth = (isTapped ? BASE_CARD_HEIGHT : baseWidth) * viewScale;
                const cardHeight = (isTapped ? baseWidth : BASE_CARD_HEIGHT) * viewScale;

                // Clamp the position to zone bounds (instead of rejecting)
                // This is more forgiving and handles scroll offset issues
                const clampedPos = {
                    x: Math.max(cardWidth / 2, Math.min(unsnappedPos.x, zoneWidth - cardWidth / 2)),
                    y: Math.max(cardHeight / 2, Math.min(unsnappedPos.y, zoneHeight - cardHeight / 2))
                };

                const unsnappedNormalized = toNormalizedPosition(clampedPos, zoneWidth, zoneHeight);
                const snappedNormalized = snapNormalizedWithZone(
                    unsnappedNormalized,
                    zoneWidth,
                    zoneHeight,
                    cardWidth,
                    cardHeight
                );

                moveCard(cardId, toZoneId, snappedNormalized, myPlayerId);
            }
        }

        // Drag is over from our perspective; ignore any subsequent move events
        currentDragSeq.current = null;
    };

    return {
        sensors,
        handleDragStart,
        handleDragMove,
        handleDragEnd
    };
};
