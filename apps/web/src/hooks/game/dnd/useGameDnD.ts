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
import { useSelectionStore } from "@/store/selectionStore";
import type { CardId, ViewerRole, ZoneId } from "@/types";
import { computeDragEndPlan, computeDragMoveUiState } from "./model";
import { getEffectiveCardSize } from "@/lib/dndBattlefield";
import {
  fromNormalizedPosition,
  getNormalizedGridSteps,
  mirrorNormalizedY,
  snapNormalizedWithZone,
  toNormalizedPosition,
} from "@/lib/positions";
import { ZONE } from "@/constants/zones";
import { resolveSelectedCardIds } from "@/models/game/selection/selectionModel";
import { debugLog, isDebugEnabled, type DebugFlagKey } from "@/lib/debug";

// Throttle helper for drag move events
const DRAG_MOVE_THROTTLE_MS = 16; // ~60fps
const FACE_DOWN_DEBUG_KEY: DebugFlagKey = "faceDownDrag";

export const useGameDnD = (params: { viewerRole?: ViewerRole } = {}) => {
  const moveCard = useGameStore((state) => state.moveCard);
  const reorderZoneCards = useGameStore((state) => state.reorderZoneCards);
  const setGhostCards = useDragStore((state) => state.setGhostCards);
  const setActiveCardId = useDragStore((state) => state.setActiveCardId);
  const setActiveCardScale = useDragStore((state) => state.setActiveCardScale);
  const setIsGroupDragging = useDragStore((state) => state.setIsGroupDragging);
  const setOverCardScale = useDragStore((state) => state.setOverCardScale);
  const myPlayerId = useGameStore((state) => state.myPlayerId);
  const clearSelection = useSelectionStore((state) => state.clearSelection);
  const isSpectator = params.viewerRole === "spectator";

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const dragSeq = React.useRef(0);
  const currentDragSeq = React.useRef<number | null>(null);
  const loggedMissingGhostRef = React.useRef(false);
  const dragSelectionRef = React.useRef<{
    activeCardId: CardId;
    groupCardIds: CardId[];
    startPositions: Record<CardId, { x: number; y: number }>;
    startZoneId: ZoneId;
  } | null>(null);

  const handleDragStart = (event: DragStartEvent) => {
    if (isSpectator) return;
    currentDragSeq.current = ++dragSeq.current;
    dragSelectionRef.current = null;
    loggedMissingGhostRef.current = false;

    setGhostCards(null);
    setIsGroupDragging(false);
    if (event.active.data.current?.cardId) {
      const cardId = event.active.data.current.cardId as CardId;
      setActiveCardId(cardId);
      const cardScale =
        typeof event.active.data.current.cardScale === "number"
          ? event.active.data.current.cardScale
          : 1;
      setActiveCardScale(cardScale);

      const state = useGameStore.getState();
      const activeCard = state.cards[cardId];
      if (!activeCard) return;
      if (activeCard.faceDown) {
        debugLog(FACE_DOWN_DEBUG_KEY, "drag-start", {
          cardId,
          zoneId: activeCard.zoneId,
          position: activeCard.position,
          tapped: activeCard.tapped,
        });
      }

      const selectionState = useSelectionStore.getState();
      const groupIds = resolveSelectedCardIds({
        seedCardId: cardId,
        cardsById: state.cards,
        selection: selectionState,
        minCount: 2,
        fallbackToSeed: true,
      });

      if (groupIds.length > 1) {
        setIsGroupDragging(true);
        const startPositions: Record<CardId, { x: number; y: number }> = {};
        groupIds.forEach((id) => {
          const card = state.cards[id];
          if (card) startPositions[id] = card.position;
        });
        dragSelectionRef.current = {
          activeCardId: cardId,
          groupCardIds: groupIds,
          startPositions,
          startZoneId: activeCard.zoneId,
        };
      }
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
    [
      isSpectator,
      myPlayerId,
      params.viewerRole,
      setGhostCards,
      setOverCardScale,
    ]
  );

  const handleDragMoveImpl = (event: DragMoveEvent) => {
    if (isSpectator) {
      setGhostCards(null);
      setOverCardScale(1);
      return;
    }
    if (currentDragSeq.current == null) {
      return;
    }

    const state = useGameStore.getState();
    const { active, over } = event;

    const activeCardId = active.data.current?.cardId as CardId | undefined;
    const activeCard = activeCardId ? state.cards[activeCardId] : undefined;

    const result = computeDragMoveUiState({
      myPlayerId,
      viewerRole: params.viewerRole,
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
            cardBaseHeight: over.data.current?.cardBaseHeight,
            cardBaseWidth: over.data.current?.cardBaseWidth,
            mirrorY: Boolean(over.data.current?.mirrorY),
          }
        : null,
    });

    if (
      activeCard?.faceDown &&
      !result.ghostCard &&
      !loggedMissingGhostRef.current
    ) {
      loggedMissingGhostRef.current = true;
      debugLog(FACE_DOWN_DEBUG_KEY, "missing-ghost", {
        cardId: activeCardId,
        overZoneId: over?.id,
        overType: over?.data.current?.type,
        hasActiveRect: Boolean(active.rect.current?.translated),
        isDebugEnabled: isDebugEnabled(FACE_DOWN_DEBUG_KEY),
      });
    }

    const group = dragSelectionRef.current;
    const isGroupDragging = Boolean(group && group.groupCardIds.length > 1);
    setOverCardScale(result.overCardScale);

    if (!isGroupDragging) {
      if (result.ghostCard && activeCardId) {
        setGhostCards([
          {
            cardId: activeCardId,
            zoneId: result.ghostCard.zoneId,
            position: result.ghostCard.position,
            tapped: result.ghostCard.tapped,
          },
        ]);
      } else {
        setGhostCards(null);
      }
      return;
    }

    if (
      !group ||
      !result.ghostCard ||
      !over ||
      over.data.current?.type !== ZONE.BATTLEFIELD
    ) {
      setGhostCards(null);
      return;
    }

    const targetZone = state.zones[over.id as ZoneId];
    if (!targetZone) {
      setGhostCards(null);
      return;
    }

    const zoneScale = over.data.current?.scale ?? 1;
    const zoneWidth = (over.rect.width || 0) / (zoneScale || 1);
    const zoneHeight = (over.rect.height || 0) / (zoneScale || 1);
    if (!zoneWidth || !zoneHeight) {
      setGhostCards(null);
      return;
    }

    const mirrorY = Boolean(over.data.current?.mirrorY);
    const viewScale = over.data.current?.cardScale ?? 1;
    const baseCardHeight = over.data.current?.cardBaseHeight;
    const baseCardWidth = over.data.current?.cardBaseWidth;

    const activeStart = group.startPositions[group.activeCardId];
    if (!activeStart) {
      setGhostCards(null);
      return;
    }

    const activeGhostView = toNormalizedPosition(
      result.ghostCard.position,
      zoneWidth,
      zoneHeight
    );
    const activeGhostCanonical = mirrorY
      ? mirrorNormalizedY(activeGhostView)
      : activeGhostView;

    const delta = {
      x: activeGhostCanonical.x - activeStart.x,
      y: activeGhostCanonical.y - activeStart.y,
    };

    const ghostCards = group.groupCardIds
      .map((id) => {
        const card = state.cards[id];
        const startPos = group.startPositions[id];
        if (!card || !startPos) return null;

        const candidate = {
          x: startPos.x + delta.x,
          y: startPos.y + delta.y,
        };
        const { cardWidth, cardHeight } = getEffectiveCardSize({
          viewScale,
          isTapped: card.tapped,
          baseCardHeight,
          baseCardWidth,
        });
        const snapped = snapNormalizedWithZone(
          candidate,
          zoneWidth,
          zoneHeight,
          cardWidth,
          cardHeight
        );
        const viewNormalized = mirrorY ? mirrorNormalizedY(snapped) : snapped;
        const position = fromNormalizedPosition(
          viewNormalized,
          zoneWidth,
          zoneHeight
        );
        return {
          cardId: card.id,
          zoneId: targetZone.id,
          position,
          tapped: card.tapped,
        };
      })
      .filter((value): value is NonNullable<typeof value> => Boolean(value));

    setGhostCards(ghostCards.length > 0 ? ghostCards : null);
  };

  const handleDragEnd = React.useCallback(
    (event: DragEndEvent) => {
      if (isSpectator) return;
      if (pendingMoveFrame.current) {
        cancelAnimationFrame(pendingMoveFrame.current);
        pendingMoveFrame.current = null;
      }

      const { active, over } = event;
      setGhostCards(null);
      setActiveCardId(null);
      setActiveCardScale(1);
      setIsGroupDragging(false);
      setOverCardScale(1);
      currentDragSeq.current = null;

      if (!over || active.id === over.id) return;

      const cardId = active.data.current?.cardId as CardId | undefined;
      const toZoneId = over.data.current?.zoneId as ZoneId | undefined;
      if (!cardId || !toZoneId) return;

      const state = useGameStore.getState();
      const plan = computeDragEndPlan({
        myPlayerId,
        viewerRole: params.viewerRole,
        cards: state.cards,
        zones: state.zones,
        cardId,
        toZoneId,
        overCardId: over.data.current?.cardId as CardId | undefined,
        activeRect: active.rect.current?.translated,
        overRect: over.rect,
        overScale: over.data.current?.scale,
        overCardScale: over.data.current?.cardScale,
        overCardBaseHeight: over.data.current?.cardBaseHeight,
        overCardBaseWidth: over.data.current?.cardBaseWidth,
        mirrorY: Boolean(over.data.current?.mirrorY),
        activeTapped: Boolean(active.data.current?.tapped),
      });
      const activeCard = state.cards[cardId];
      if (activeCard?.faceDown) {
        debugLog(FACE_DOWN_DEBUG_KEY, "drag-end-plan", {
          cardId,
          plan,
          fromZoneId: activeCard.zoneId,
          faceDown: activeCard.faceDown,
        });
      }

      const group = dragSelectionRef.current;
      dragSelectionRef.current = null;

      if (plan.kind === "reorderHand") {
        const zone = state.zones[plan.zoneId];
        if (!zone) return;
        const newOrder = arrayMove(zone.cardIds, plan.oldIndex, plan.newIndex);
        reorderZoneCards(plan.zoneId, newOrder, myPlayerId);
        return;
      }

      if (plan.kind === "moveCard") {
        if (group && group.groupCardIds.length > 1) {
          const targetZone = state.zones[plan.toZoneId];
          if (!targetZone) return;

          const activeStart = group.startPositions[group.activeCardId];
          if (!activeStart) return;

          if (targetZone.type === ZONE.BATTLEFIELD && plan.position) {
            const delta = {
              x: plan.position.x - activeStart.x,
              y: plan.position.y - activeStart.y,
            };
            const zoneScale = over?.data.current?.scale ?? 1;
            const cardScale = over?.data.current?.cardScale ?? 1;
            const baseCardHeight = over?.data.current?.cardBaseHeight;
            const baseCardWidth = over?.data.current?.cardBaseWidth;
            const zoneWidth = (over?.rect.width ?? 0) / (zoneScale || 1);
            const zoneHeight = (over?.rect.height ?? 0) / (zoneScale || 1);

            const targetPositions: Record<CardId, { x: number; y: number }> = {};
            const movingIds: CardId[] = [];
            const stepYById: Record<CardId, number> = {};
            group.groupCardIds.forEach((id) => {
              const card = state.cards[id];
              if (!card) return;
              if (card.zoneId !== group.startZoneId) return;
              const startPos = group.startPositions[id];
              if (!startPos) return;

              const target = {
                x: startPos.x + delta.x,
                y: startPos.y + delta.y,
              };
              const { cardWidth, cardHeight } = getEffectiveCardSize({
                viewScale: cardScale,
                isTapped: card.tapped,
                baseCardHeight,
                baseCardWidth,
              });
              const snapped = snapNormalizedWithZone(
                target,
                zoneWidth,
                zoneHeight,
                cardWidth,
                cardHeight
              );
              targetPositions[id] = snapped;
              movingIds.push(id);

              const stepY = getNormalizedGridSteps({
                isTapped: card.tapped,
                zoneHeight,
                viewScale: cardScale,
                baseCardHeight,
                baseCardWidth,
              }).stepY;
              if (stepY) stepYById[id] = stepY;
            });

            const groupCollision = {
              movingCardIds: movingIds,
              targetPositions,
              stepYById,
            };
            movingIds.forEach((id) => {
              const snapped = targetPositions[id];
              if (!snapped) return;
              moveCard(id, plan.toZoneId, snapped, myPlayerId, undefined, {
                suppressLog: id !== group.activeCardId,
                groupCollision,
              });
            });
            if (targetZone.ownerId !== myPlayerId) {
              clearSelection();
            }
            return;
          }

          group.groupCardIds.forEach((id) => {
            const card = state.cards[id];
            if (!card) return;
            if (card.zoneId !== group.startZoneId) return;
            moveCard(id, plan.toZoneId, plan.position, myPlayerId, undefined, {
              suppressLog: id !== group.activeCardId,
              skipCollision: true,
            });
          });
          if (targetZone.type !== ZONE.BATTLEFIELD || targetZone.ownerId !== myPlayerId) {
            clearSelection();
          }
          return;
        }

        const targetZone = state.zones[plan.toZoneId];
        const activeCard = state.cards[plan.cardId];
        const zoneScale = over?.data.current?.scale ?? 1;
        const zoneHeight = (over?.rect.height ?? 0) / (zoneScale || 1);
        const viewScale = over?.data.current?.cardScale ?? 1;
        const baseCardHeight = over?.data.current?.cardBaseHeight;
        const baseCardWidth = over?.data.current?.cardBaseWidth;
        const gridStepY =
          targetZone?.type === ZONE.BATTLEFIELD && zoneHeight
            ? getNormalizedGridSteps({
                isTapped: activeCard?.tapped,
                zoneHeight,
                viewScale,
                baseCardHeight,
                baseCardWidth,
              }).stepY
            : undefined;

        moveCard(
          plan.cardId,
          plan.toZoneId,
          plan.position,
          myPlayerId,
          undefined,
          gridStepY ? { gridStepY } : undefined
        );
        if (
          targetZone &&
          activeCard &&
          (targetZone.type !== ZONE.BATTLEFIELD ||
            targetZone.ownerId !== myPlayerId)
        ) {
          const selectionState = useSelectionStore.getState();
          if (
            selectionState.selectionZoneId === activeCard.zoneId &&
            selectionState.selectedCardIds.includes(plan.cardId)
          ) {
            clearSelection();
          }
        }
      }
    },
    [
      clearSelection,
      isSpectator,
      moveCard,
      myPlayerId,
      params.viewerRole,
      reorderZoneCards,
      setActiveCardId,
      setActiveCardScale,
      setGhostCards,
      setOverCardScale,
    ]
  );

  return {
    sensors,
    handleDragStart,
    handleDragMove,
    handleDragEnd,
  };
};
