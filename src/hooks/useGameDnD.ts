import React from 'react';
import {
    useSensor,
    useSensors,
    PointerSensor,
    DragEndEvent,
    DragMoveEvent,
    DragStartEvent
} from '@dnd-kit/core';
import { useGameStore } from '../store/gameStore';
import { useDragStore } from '../store/dragStore';
import { ZoneId, CardId } from '../types';
import {
    getEventCoordinates,
    calculatePointerOffset,
    calculateRelativePosition,
    canDropToZone,
    DragPosition,
    DragOffset
} from '../lib/dnd';
import { CARD_HEIGHT_PX, CARD_WIDTH_PX } from '../lib/constants';

export const useGameDnD = () => {
    const cards = useGameStore((state) => state.cards);
    const zones = useGameStore((state) => state.zones);
    const moveCard = useGameStore((state) => state.moveCard);
    const setGhostCard = useDragStore((state) => state.setGhostCard);
    const setActiveCardId = useDragStore((state) => state.setActiveCardId);

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
        const overlayRect = active.rect.current?.translated || active.rect.current?.initial;

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
                // @ts-ignore - over.rect is available at runtime
                const overRect = over.rect;
                const scale = over.data.current?.scale || 1;

                if (!dragPointerStart.current) return;

                const unsnappedPos = calculateRelativePosition(
                    dragPointerStart.current,
                    dragPointerToCenter.current,
                    { x: event.delta.x, y: event.delta.y },
                    overRect,
                    scale
                );


                setGhostCard({
                    zoneId,
                    position: unsnappedPos,
                    tapped: isTapped
                });
                if (!dragMoveLogged.current) {
                    startGhostPos.current = unsnappedPos;
                    dragMoveLogged.current = true;
                }
                lastGhostPos.current = unsnappedPos;

                // One-time per drag anchor tracking (kept for potential future use)
                if (!startLogged.current) {
                    startLogged.current = true;
                }
            }
        } else {
            setGhostCard(null);
        }
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        setGhostCard(null);
        setActiveCardId(null);

        if (over && active.id !== over.id) {
            const cardId = active.data.current?.cardId as CardId;
            const toZoneId = over.data.current?.zoneId as ZoneId;

            const activeCard = cards[cardId];
            const targetZone = zones[toZoneId];
            const isTapped = active.data.current?.tapped || activeCard?.tapped;

            if (cardId && toZoneId && activeCard && targetZone) {
                if (!canDropToZone(activeCard, targetZone)) {
                    console.warn('Permission denied: Cannot move card to this zone.');
                    return;
                }

                // @ts-ignore - over.rect is available at runtime
                const overRect = over.rect;
                const scale = over.data.current?.scale || 1;

                if (!dragPointerStart.current) return;

                const position = calculateRelativePosition(
                    dragPointerStart.current,
                    dragPointerToCenter.current,
                    { x: event.delta.x, y: event.delta.y },
                    overRect,
                    scale
                );

                moveCard(cardId, toZoneId, position);

                const summarizePoint = (p: DragPosition | DragOffset | null | undefined) =>
                    p ? `${p.x.toFixed(1)},${p.y.toFixed(1)}` : 'null';
                const summarizeSize = (w?: number | null, h?: number | null) =>
                    w != null && h != null ? `${w.toFixed(1)}x${h.toFixed(1)}` : 'null';

                const pointerStart = dragPointerStart.current;
                const pointerEnd = pointerStart
                    ? { x: pointerStart.x + event.delta.x, y: pointerStart.y + event.delta.y }
                    : null;
                const cardRect = cardRectRef.current;
                const ghostWidth = CARD_WIDTH_PX * scale;
                const ghostHeight = CARD_HEIGHT_PX * scale;
                const snapped = useGameStore.getState().cards[cardId]?.position;
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
