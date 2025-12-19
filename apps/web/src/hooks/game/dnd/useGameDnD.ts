import React from "react";
import {
  useSensor,
  useSensors,
  PointerSensor,
  DragEndEvent,
  DragMoveEvent,
  DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";

import { useGameStore } from "@/store/gameStore";
import { useDragStore } from "@/store/dragStore";
import type { CardId, ZoneId } from "@/types";
import { computeDragEndPlan, computeDragMoveUiState } from "./model";

// Throttle helper for drag move events
const DRAG_MOVE_THROTTLE_MS = 16; // ~60fps

export const useGameDnD = () => {
  const moveCard = useGameStore((state) => state.moveCard);
  const reorderZoneCards = useGameStore((state) => state.reorderZoneCards);
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

  const dragSeq = React.useRef(0);
  const currentDragSeq = React.useRef<number | null>(null);

  const handleDragStart = (event: DragStartEvent) => {
    currentDragSeq.current = ++dragSeq.current;

    setGhostCard(null);
    if (event.active.data.current?.cardId) {
      setActiveCardId(event.active.data.current.cardId);
    }
  };

  const lastMoveTime = React.useRef(0);
  const pendingMoveFrame = React.useRef<number | null>(null);
  const latestMoveEvent = React.useRef<DragMoveEvent | null>(null);

  const handleDragMove = React.useCallback(
    (event: DragMoveEvent) => {
      const now = performance.now();
      if (now - lastMoveTime.current < DRAG_MOVE_THROTTLE_MS) {
        latestMoveEvent.current = event;
        if (!pendingMoveFrame.current) {
          pendingMoveFrame.current = requestAnimationFrame(() => {
            pendingMoveFrame.current = null;
            const latest = latestMoveEvent.current;
            latestMoveEvent.current = null;
            lastMoveTime.current = performance.now();
            if (latest) handleDragMoveImpl(latest);
          });
        }
        return;
      }
      lastMoveTime.current = now;
      handleDragMoveImpl(event);
    },
    [myPlayerId, setGhostCard, setOverCardScale, setZoomEdge]
  );

  const handleDragMoveImpl = (event: DragMoveEvent) => {
    if (currentDragSeq.current == null) {
      return;
    }

    const state = useGameStore.getState();
    const { active, over } = event;

    const activeCardId = active.data.current?.cardId as CardId | undefined;

    const result = computeDragMoveUiState({
      myPlayerId,
      cards: state.cards,
      zones: state.zones,
      activeCardId,
      activeRect: active.rect.current?.translated,
      activeTapped: Boolean(active.data.current?.tapped),
      over: over
        ? {
            id: over.id as ZoneId,
            type: over.data.current?.type,
            rect: over.rect,
            scale: over.data.current?.scale,
            cardScale: over.data.current?.cardScale,
            mirrorY: Boolean(over.data.current?.mirrorY),
          }
        : null,
    });

    setGhostCard(result.ghostCard);
    setOverCardScale(result.overCardScale);
    setZoomEdge(result.zoomEdge);
  };

  const handleDragEnd = React.useCallback(
    (event: DragEndEvent) => {
      if (pendingMoveFrame.current) {
        cancelAnimationFrame(pendingMoveFrame.current);
        pendingMoveFrame.current = null;
      }

      const { active, over } = event;
      setGhostCard(null);
      setActiveCardId(null);
      setOverCardScale(1);
      setZoomEdge(null);
      currentDragSeq.current = null;

      if (!over || active.id === over.id) return;

      const cardId = active.data.current?.cardId as CardId | undefined;
      const toZoneId = over.data.current?.zoneId as ZoneId | undefined;
      if (!cardId || !toZoneId) return;

      const state = useGameStore.getState();
      const plan = computeDragEndPlan({
        myPlayerId,
        cards: state.cards,
        zones: state.zones,
        cardId,
        toZoneId,
        overCardId: over.data.current?.cardId as CardId | undefined,
        activeRect: active.rect.current?.translated,
        overRect: over.rect,
        overScale: over.data.current?.scale,
        overCardScale: over.data.current?.cardScale,
        mirrorY: Boolean(over.data.current?.mirrorY),
        activeTapped: Boolean(active.data.current?.tapped),
      });

      if (plan.kind === "reorderHand") {
        const zone = state.zones[plan.zoneId];
        if (!zone) return;
        const newOrder = arrayMove(zone.cardIds, plan.oldIndex, plan.newIndex);
        reorderZoneCards(plan.zoneId, newOrder, myPlayerId);
        return;
      }

      if (plan.kind === "moveCard") {
        moveCard(plan.cardId, plan.toZoneId, plan.position, myPlayerId);
      }
    },
    [
      moveCard,
      myPlayerId,
      reorderZoneCards,
      setActiveCardId,
      setGhostCard,
      setOverCardScale,
      setZoomEdge,
    ]
  );

  return {
    sensors,
    handleDragStart,
    handleDragMove,
    handleDragEnd,
  };
};
