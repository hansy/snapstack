import React from "react";

import type { Card } from "@/types";

import { cn } from "@/lib/utils";
import { CardView } from "../card/Card";
import { useTwoFingerScroll } from "@/hooks/shared/useTwoFingerScroll";
import { getCoverFlowVisuals, useHorizontalCoverFlow } from "./coverFlow";

const TOUCH_CONTEXT_MENU_LONG_PRESS_MS = 500;
const TOUCH_MOVE_TOLERANCE_PX = 10;
const TOUCH_REORDER_START_PX = 4;

type TouchPointState = {
  cardId: string;
  startX: number;
  startY: number;
  x: number;
  y: number;
  target: HTMLDivElement;
  moved: boolean;
};

type TouchDragState = {
  pointerId: number;
  draggedCardId: string;
  started: boolean;
};

export interface ZoneViewerLinearViewProps {
  orderedCards: Card[];
  canReorder: boolean;
  orderedCardIds: string[];
  setOrderedCardIds: React.Dispatch<React.SetStateAction<string[]>>;
  draggingId: string | null;
  setDraggingId: (id: string | null) => void;
  reorderList: (ids: string[], draggingId: string, overId: string) => string[];
  commitReorder: (newOrder: string[]) => void;
  displayCards: Card[];
  interactionsDisabled: boolean;
  pinnedCardId?: string;
  onCardContextMenu: (e: React.MouseEvent, card: Card) => void;
  listRef: React.RefObject<HTMLDivElement | null>;
  cardWidthPx: number;
  cardHeightPx: number;
  mobileCoverFlow?: boolean;
}

export const ZoneViewerLinearView: React.FC<ZoneViewerLinearViewProps> = ({
  orderedCards,
  canReorder,
  orderedCardIds,
  setOrderedCardIds,
  draggingId,
  setDraggingId,
  reorderList,
  commitReorder,
  displayCards,
  interactionsDisabled,
  pinnedCardId,
  onCardContextMenu,
  listRef,
  cardWidthPx,
  cardHeightPx,
  mobileCoverFlow = false,
}) => {
  const renderCards = React.useMemo(() => [...orderedCards].reverse(), [orderedCards]);
  const cardsById = React.useMemo(
    () => new Map(renderCards.map((card) => [card.id, card])),
    [renderCards]
  );
  const touchReorderEnabled = canReorder && !mobileCoverFlow;
  const [hoveredId, setHoveredId] = React.useState<string | null>(null);
  const [scrollNode, setScrollNode] = React.useState<HTMLDivElement | null>(null);
  useTwoFingerScroll({ target: scrollNode, axis: "x", enabled: !mobileCoverFlow });
  const latestOrderRef = React.useRef<string[]>([]);
  const touchPointsRef = React.useRef<Map<number, TouchPointState>>(new Map());
  const touchHoldTimeoutRef = React.useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const touchHoldPointerIdRef = React.useRef<number | null>(null);
  const touchDragRef = React.useRef<TouchDragState | null>(null);
  const touchContextMenuTriggeredRef = React.useRef(false);
  const coverFlowItemIds = React.useMemo(
    () => renderCards.map((card) => card.id),
    [renderCards]
  );
  const {
    centeredId,
    setCenteredId,
    setItemNode,
    scheduleCenteredUpdate,
  } = useHorizontalCoverFlow({
    enabled: mobileCoverFlow,
    itemIds: coverFlowItemIds,
    scrollNode,
  });

  React.useEffect(() => {
    latestOrderRef.current = orderedCardIds.length
      ? orderedCardIds
      : displayCards.map((card) => card.id);
  }, [displayCards, orderedCardIds]);

  const clearTouchHoldTimeout = React.useCallback(() => {
    if (touchHoldTimeoutRef.current) {
      clearTimeout(touchHoldTimeoutRef.current);
      touchHoldTimeoutRef.current = null;
    }
  }, []);

  const cancelTouchHold = React.useCallback(() => {
    clearTouchHoldTimeout();
    touchHoldPointerIdRef.current = null;
  }, [clearTouchHoldTimeout]);

  const reorderFromTouch = React.useCallback(
    (draggedCardId: string, overCardId: string) => {
      const source = latestOrderRef.current.length
        ? latestOrderRef.current
        : displayCards.map((card) => card.id);
      const rendered = [...source].reverse();
      const reordered = reorderList(rendered, draggedCardId, overCardId);
      const nextOrder = reordered.reverse();
      latestOrderRef.current = nextOrder;
      setOrderedCardIds(nextOrder);
    },
    [displayCards, reorderList, setOrderedCardIds]
  );

  const beginTouchHold = React.useCallback((pointerId: number) => {
    if (interactionsDisabled) return;
    const point = touchPointsRef.current.get(pointerId);
    if (!point) return;
    const targetCard = cardsById.get(point.cardId);
    if (!targetCard) return;

    touchHoldPointerIdRef.current = pointerId;
    clearTouchHoldTimeout();
    touchHoldTimeoutRef.current = setTimeout(() => {
      if (touchHoldPointerIdRef.current !== pointerId) return;
      if (touchPointsRef.current.size !== 1) return;
      const currentPoint = touchPointsRef.current.get(pointerId);
      if (!currentPoint) return;
      if (currentPoint.moved) return;
      touchContextMenuTriggeredRef.current = true;
      touchDragRef.current = null;
      setDraggingId(null);
      cancelTouchHold();
      onCardContextMenu(
        {
          preventDefault: () => {},
          stopPropagation: () => {},
          clientX: currentPoint.x,
          clientY: currentPoint.y,
          currentTarget: currentPoint.target,
          target: currentPoint.target,
        } as unknown as React.MouseEvent,
        targetCard
      );
    }, TOUCH_CONTEXT_MENU_LONG_PRESS_MS);
  }, [
    cancelTouchHold,
    cardsById,
    clearTouchHoldTimeout,
    interactionsDisabled,
    onCardContextMenu,
    setDraggingId,
  ]);

  const handleTouchPointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>, card: Card) => {
      if (event.pointerType !== "touch") return;
      if (interactionsDisabled) return;
      if (event.button !== 0) return;

      if (!mobileCoverFlow) {
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // Ignore capture failures on unsupported environments.
        }
      }

      touchPointsRef.current.set(event.pointerId, {
        cardId: card.id,
        startX: event.clientX,
        startY: event.clientY,
        x: event.clientX,
        y: event.clientY,
        target: event.currentTarget,
        moved: false,
      });

      const pointCount = touchPointsRef.current.size;
      if (pointCount === 1) {
        touchContextMenuTriggeredRef.current = false;
        touchDragRef.current = touchReorderEnabled
          ? {
              pointerId: event.pointerId,
              draggedCardId: card.id,
              started: false,
            }
          : null;
        beginTouchHold(event.pointerId);
      } else {
        touchDragRef.current = null;
        setDraggingId(null);
        cancelTouchHold();
      }
    },
    [
      beginTouchHold,
      cancelTouchHold,
      interactionsDisabled,
      mobileCoverFlow,
      setDraggingId,
      touchReorderEnabled,
    ]
  );

  const handleTouchPointerMove = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.pointerType !== "touch") return;
      const point = touchPointsRef.current.get(event.pointerId);
      if (!point) return;

      point.x = event.clientX;
      point.y = event.clientY;
      if (!point.moved) {
        const dx = event.clientX - point.startX;
        const dy = event.clientY - point.startY;
        if (Math.hypot(dx, dy) > TOUCH_MOVE_TOLERANCE_PX) {
          point.moved = true;
        }
      }

      if (
        touchHoldPointerIdRef.current === event.pointerId &&
        point.moved
      ) {
        cancelTouchHold();
      }

      const drag = touchDragRef.current;
      if (!drag) return;
      if (drag.pointerId !== event.pointerId) return;
      if (touchPointsRef.current.size !== 1) return;
      if (!touchReorderEnabled || touchContextMenuTriggeredRef.current) return;

      if (!drag.started) {
        const movement = Math.hypot(point.x - point.startX, point.y - point.startY);
        if (movement <= TOUCH_REORDER_START_PX) return;
        drag.started = true;
        setDraggingId(drag.draggedCardId);
      }

      event.preventDefault();
      const elementFromPoint =
        typeof document.elementFromPoint === "function"
          ? document.elementFromPoint.bind(document)
          : null;
      if (!elementFromPoint) return;
      const target = elementFromPoint(event.clientX, event.clientY)?.closest(
        "[data-zone-viewer-card-id]"
      );
      const overCardId = target?.getAttribute("data-zone-viewer-card-id");
      if (!overCardId) return;
      if (overCardId === drag.draggedCardId) return;
      reorderFromTouch(drag.draggedCardId, overCardId);
    },
    [cancelTouchHold, reorderFromTouch, setDraggingId, touchReorderEnabled]
  );

  const finishTouchPointer = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.pointerType !== "touch") return;
      const point = touchPointsRef.current.get(event.pointerId);
      if (!point) return;

      if (
        typeof event.currentTarget.hasPointerCapture === "function" &&
        typeof event.currentTarget.releasePointerCapture === "function" &&
        event.currentTarget.hasPointerCapture(event.pointerId)
      ) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      touchPointsRef.current.delete(event.pointerId);
      if (touchHoldPointerIdRef.current === event.pointerId) {
        cancelTouchHold();
      }

      const drag = touchDragRef.current;
      if (drag && drag.pointerId === event.pointerId) {
        const shouldCommit =
          drag.started && !touchContextMenuTriggeredRef.current;
        touchDragRef.current = null;
        setDraggingId(null);
        if (shouldCommit) {
          commitReorder(latestOrderRef.current);
        }
      }

      if (
        mobileCoverFlow &&
        !point.moved &&
        !touchContextMenuTriggeredRef.current
      ) {
        setCenteredId(point.cardId);
      }

      if (touchPointsRef.current.size === 0) {
        touchContextMenuTriggeredRef.current = false;
      }
    },
    [cancelTouchHold, commitReorder, mobileCoverFlow, setDraggingId]
  );

  React.useEffect(() => {
    return () => {
      cancelTouchHold();
      touchPointsRef.current.clear();
      touchDragRef.current = null;
    };
  }, [cancelTouchHold]);

  const activeCardId =
    mobileCoverFlow
      ? centeredId ?? renderCards[0]?.id ?? null
      : hoveredId;
  const hoveredIndex = React.useMemo(() => {
    if (!activeCardId) return -1;
    return renderCards.findIndex((card) => card.id === activeCardId);
  }, [activeCardId, renderCards]);

  const setListRef = React.useCallback(
    (node: HTMLDivElement | null) => {
      (listRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      setScrollNode(node);
    },
    [listRef]
  );
  const effectiveCardHeightPx = Math.max(1, Math.round(cardHeightPx));
  const effectiveCardWidthPx = Math.max(1, Math.round(cardWidthPx));
  const slotWidthPx = Math.max(50, Math.round(effectiveCardWidthPx * 0.28));
  const maxSpreadPx = Math.round(effectiveCardWidthPx * 0.5);
  const decayPx = Math.max(8, Math.round(effectiveCardWidthPx * 0.07));
  const mobileTopBottomPaddingPx = Math.max(40, Math.round(effectiveCardHeightPx * 0.12));

  return (
    <div
      ref={setListRef}
      className={cn(
        "flex h-full min-h-0 items-center overflow-x-auto",
        mobileCoverFlow
          ? "touch-pan-x snap-x snap-mandatory overscroll-x-contain scroll-smooth"
          : "px-24 py-8 touch-none"
      )}
      onScroll={mobileCoverFlow ? scheduleCenteredUpdate : undefined}
      style={{
        pointerEvents: interactionsDisabled ? "none" : "auto",
        WebkitOverflowScrolling: "touch",
        paddingLeft: mobileCoverFlow ? `calc(50% - ${Math.round(slotWidthPx / 2)}px)` : undefined,
        paddingRight: mobileCoverFlow
          ? `calc(50% - ${Math.round(slotWidthPx / 2)}px)`
          : undefined,
        paddingTop: mobileCoverFlow ? `${mobileTopBottomPaddingPx}px` : undefined,
        paddingBottom: mobileCoverFlow ? `${mobileTopBottomPaddingPx}px` : undefined,
      }}
    >
      {renderCards.map((card, index) => {
        const isPinned = pinnedCardId === card.id;
        const isDragging = draggingId === card.id;
        const isHovered = activeCardId === card.id;
        const distance = hoveredIndex < 0 ? -1 : Math.abs(index - hoveredIndex);
        const offset = mobileCoverFlow
          ? 0
          : (() => {
              if (hoveredIndex < 0) return 0;
              if (distance === 0) return 0;
              const direction = index < hoveredIndex ? -1 : 1;
              const magnitude = Math.max(0, maxSpreadPx - (distance - 1) * decayPx);
              return direction * magnitude;
            })();
        const visuals = getCoverFlowVisuals({
          isFocused: isHovered,
          distance,
          isPinned,
          cardHeightPx: effectiveCardHeightPx,
        });
        const scale = mobileCoverFlow ? visuals.scale : isPinned ? 1.1 : isHovered ? 1.08 : 1;
        const zIndex = (() => {
          if (mobileCoverFlow) return visuals.zIndex;
          if (isPinned) return 300;
          if (isHovered) return 200;
          if (hoveredIndex < 0) return renderCards.length - index;
          return 150 - distance;
        })();
        return (
          <div
            key={card.id}
            ref={(node) => setItemNode(card.id, node)}
            data-zone-viewer-card-id={card.id}
            data-zone-viewer-focused={isHovered ? "true" : "false"}
            draggable={canReorder && !mobileCoverFlow}
            onDragStart={() => canReorder && !mobileCoverFlow && setDraggingId(card.id)}
            onDragEnter={(e) => {
              if (!canReorder || mobileCoverFlow || !draggingId) return;
              e.preventDefault();
              setOrderedCardIds((ids) => {
                const source = ids.length ? ids : displayCards.map((c) => c.id);
                const rendered = [...source].reverse();
                const reordered = reorderList(rendered, draggingId, card.id);
                return reordered.reverse();
              });
            }}
            onDragOver={
              canReorder && !mobileCoverFlow ? (e) => e.preventDefault() : undefined
            }
            onDragEnd={() => {
              if (!canReorder || mobileCoverFlow || !draggingId) return;
              commitReorder(orderedCardIds.length ? orderedCardIds : displayCards.map((c) => c.id));
              setDraggingId(null);
            }}
            onDrop={(e) => {
              if (!canReorder || mobileCoverFlow) return;
              e.preventDefault();
            }}
            onMouseEnter={() => setHoveredId(card.id)}
            onMouseLeave={() =>
              setHoveredId((prev) => (prev === card.id ? null : prev))
            }
            onPointerDown={(event) => handleTouchPointerDown(event, card)}
            onPointerMove={handleTouchPointerMove}
            onPointerUp={finishTouchPointer}
            onPointerCancel={finishTouchPointer}
            onPointerLeave={finishTouchPointer}
            className={cn(
              "shrink-0 transition-transform duration-200 ease-out relative group flex items-start justify-center"
            )}
            style={{
              width: slotWidthPx,
              transform: `translateX(${offset}px) translateY(${
                mobileCoverFlow ? visuals.liftPx : 0
              }px) scale(${scale})`,
              zIndex,
              opacity: isDragging ? 0.5 : mobileCoverFlow ? visuals.opacity : 1,
              scrollSnapAlign: mobileCoverFlow ? "center" : undefined,
              scrollSnapStop: mobileCoverFlow ? "always" : undefined,
            }}
          >
            <div
              className={cn(
                "relative transition-all duration-200 ease-out",
                mobileCoverFlow && isHovered && "drop-shadow-[0_14px_28px_rgba(99,102,241,0.5)]"
              )}
              style={{ width: effectiveCardWidthPx, height: effectiveCardHeightPx }}
            >
              {index === 0 && (
                <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-indigo-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap shadow-md z-[101]">
                  Top card
                </div>
              )}
              <CardView
                card={card}
                faceDown={false}
                style={{ width: effectiveCardWidthPx, height: effectiveCardHeightPx }}
                className="w-full h-full shadow-lg"
                imageClassName="object-top"
                preferArtCrop={false}
                disableHoverAnimation
                onContextMenu={(e) => onCardContextMenu(e, card)}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};
