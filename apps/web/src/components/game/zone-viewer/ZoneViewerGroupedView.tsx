import React from "react";

import type { Card } from "@/types";

import { cn } from "@/lib/utils";
import { CardView } from "../card/Card";
import { useTwoFingerScroll } from "@/hooks/shared/useTwoFingerScroll";
import { getCoverFlowVisuals, useHorizontalCoverFlow } from "./coverFlow";

const TOUCH_CONTEXT_MENU_LONG_PRESS_MS = 500;
const TOUCH_MOVE_TOLERANCE_PX = 10;

type TouchPointState = {
  cardId: string;
  startX: number;
  startY: number;
  x: number;
  y: number;
  target: HTMLDivElement;
  moved: boolean;
};

export interface ZoneViewerGroupedViewProps {
  sortedKeys: string[];
  groupedCards: Record<string, Card[]>;
  cardWidthPx: number;
  cardHeightPx: number;
  interactionsDisabled: boolean;
  pinnedCardId?: string;
  onCardContextMenu: (e: React.MouseEvent, card: Card) => void;
  mobileCoverFlow?: boolean;
}

const useTouchCardContextMenu = (params: {
  cardsById: Map<string, Card>;
  interactionsDisabled: boolean;
  onCardContextMenu: (e: React.MouseEvent, card: Card) => void;
  capturePointer: boolean;
  onTapCard?: (cardId: string) => void;
}) => {
  const { cardsById, interactionsDisabled, onCardContextMenu, capturePointer, onTapCard } = params;
  const touchPointsRef = React.useRef<Map<number, TouchPointState>>(new Map());
  const touchHoldTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchHoldPointerIdRef = React.useRef<number | null>(null);
  const touchContextMenuTriggeredRef = React.useRef(false);

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

  const beginTouchHold = React.useCallback(
    (pointerId: number) => {
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
        if (!currentPoint || currentPoint.moved) return;
        touchContextMenuTriggeredRef.current = true;
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
    },
    [cancelTouchHold, cardsById, clearTouchHoldTimeout, interactionsDisabled, onCardContextMenu]
  );

  const handlePointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>, cardId: string) => {
      if (event.pointerType !== "touch") return;
      if (interactionsDisabled) return;
      if (event.button !== 0) return;

      if (capturePointer) {
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // Ignore capture failures on unsupported environments.
        }
      }

      touchPointsRef.current.set(event.pointerId, {
        cardId,
        startX: event.clientX,
        startY: event.clientY,
        x: event.clientX,
        y: event.clientY,
        target: event.currentTarget,
        moved: false,
      });

      if (touchPointsRef.current.size === 1) {
        touchContextMenuTriggeredRef.current = false;
        beginTouchHold(event.pointerId);
      } else {
        cancelTouchHold();
      }
    },
    [beginTouchHold, cancelTouchHold, capturePointer, interactionsDisabled]
  );

  const handlePointerMove = React.useCallback(
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

      if (touchHoldPointerIdRef.current === event.pointerId && point.moved) {
        cancelTouchHold();
      }
    },
    [cancelTouchHold]
  );

  const finishPointer = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.pointerType !== "touch") return;
      const point = touchPointsRef.current.get(event.pointerId);
      if (!point) return;

      if (
        capturePointer &&
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
      if (
        onTapCard &&
        !point.moved &&
        !touchContextMenuTriggeredRef.current
      ) {
        onTapCard(point.cardId);
      }
      if (touchPointsRef.current.size === 0) {
        touchContextMenuTriggeredRef.current = false;
      }
    },
    [cancelTouchHold, capturePointer, onTapCard]
  );

  React.useEffect(() => {
    return () => {
      cancelTouchHold();
      touchPointsRef.current.clear();
    };
  }, [cancelTouchHold]);

  return {
    handlePointerDown,
    handlePointerMove,
    finishPointer,
  };
};

type GroupedColumnProps = {
  groupKey: string;
  cardsInGroup: Card[];
  cardWidthPx: number;
  cardHeightPx: number;
  interactionsDisabled: boolean;
  pinnedCardId?: string;
  onCardContextMenu: (e: React.MouseEvent, card: Card) => void;
  columnWidthPx: number;
  overlapPx: number;
  paddingBottomPx: number;
};

const GroupedColumn: React.FC<GroupedColumnProps> = ({
  groupKey,
  cardsInGroup,
  cardWidthPx,
  cardHeightPx,
  interactionsDisabled,
  pinnedCardId,
  onCardContextMenu,
  columnWidthPx,
  overlapPx,
  paddingBottomPx,
}) => {
  const [scrollNode, setScrollNode] = React.useState<HTMLDivElement | null>(null);
  useTwoFingerScroll({ target: scrollNode, axis: "y" });
  const cardsById = React.useMemo(
    () => new Map(cardsInGroup.map((card) => [card.id, card])),
    [cardsInGroup]
  );
  const { handlePointerDown, handlePointerMove, finishPointer } = useTouchCardContextMenu({
    cardsById,
    interactionsDisabled,
    onCardContextMenu,
    capturePointer: true,
  });

  return (
    <div className="shrink-0 flex flex-col" style={{ width: columnWidthPx }}>
      <h3 className="text-sm font-medium text-zinc-400 border-b border-zinc-800/50 pb-2 mb-4 text-center sticky top-0 bg-zinc-950/50 backdrop-blur-sm z-10">
        {groupKey} ({cardsInGroup.length})
      </h3>
      <div
        ref={setScrollNode}
        className="relative flex-1 overflow-y-auto overflow-x-hidden flex flex-col touch-none"
        style={{
          pointerEvents: interactionsDisabled ? "none" : "auto",
          paddingBottom: paddingBottomPx,
        }}
      >
        {cardsInGroup.map((card, index) => {
          const isPinned = pinnedCardId === card.id;
          return (
            <div
              key={card.id}
              data-zone-viewer-card-id={card.id}
              className={cn(
                "mx-auto transition-all duration-200",
                !interactionsDisabled && "hover:z-[100] hover:scale-110 hover:!mb-4",
                isPinned && "scale-110 shadow-xl"
              )}
              style={{
                width: `${cardWidthPx}px`,
                height: `${cardHeightPx}px`,
                marginBottom: isPinned
                  ? `${Math.round(cardHeightPx * 0.06)}px`
                  : `-${overlapPx}px`,
                zIndex: isPinned ? 200 : index,
              }}
              onPointerDown={(event) => handlePointerDown(event, card.id)}
              onPointerMove={handlePointerMove}
              onPointerUp={finishPointer}
              onPointerCancel={finishPointer}
              onPointerLeave={finishPointer}
            >
              <CardView
                card={card}
                faceDown={false}
                style={{ width: cardWidthPx, height: cardHeightPx }}
                className="w-full shadow-lg h-full"
                imageClassName="object-top"
                preferArtCrop={false}
                onContextMenu={(e) => onCardContextMenu(e, card)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};

type MobileGroupedRowProps = {
  groupKey: string;
  cardsInGroup: Card[];
  cardWidthPx: number;
  cardHeightPx: number;
  interactionsDisabled: boolean;
  pinnedCardId?: string;
  onCardContextMenu: (e: React.MouseEvent, card: Card) => void;
};

const MobileGroupedRow: React.FC<MobileGroupedRowProps> = ({
  groupKey,
  cardsInGroup,
  cardWidthPx,
  cardHeightPx,
  interactionsDisabled,
  pinnedCardId,
  onCardContextMenu,
}) => {
  const [scrollNode, setScrollNode] = React.useState<HTMLDivElement | null>(null);
  const cardIds = React.useMemo(() => cardsInGroup.map((card) => card.id), [cardsInGroup]);
  const {
    centeredId,
    setCenteredId,
    setItemNode,
    scheduleCenteredUpdate,
  } = useHorizontalCoverFlow({
    enabled: true,
    itemIds: cardIds,
    scrollNode,
  });
  const cardsById = React.useMemo(
    () => new Map(cardsInGroup.map((card) => [card.id, card])),
    [cardsInGroup]
  );
  const { handlePointerDown, handlePointerMove, finishPointer } = useTouchCardContextMenu({
    cardsById,
    interactionsDisabled,
    onCardContextMenu,
    capturePointer: false,
    onTapCard: setCenteredId,
  });

  const effectiveCardHeightPx = Math.max(1, Math.round(cardHeightPx));
  const effectiveCardWidthPx = Math.max(1, Math.round(cardWidthPx));
  const slotWidthPx = Math.max(50, Math.round(effectiveCardWidthPx * 0.28));
  const rowPaddingY = Math.max(24, Math.round(effectiveCardHeightPx * 0.08));
  const activeCardId = centeredId ?? cardsInGroup[0]?.id ?? null;
  const activeIndex = activeCardId ? cardIds.indexOf(activeCardId) : -1;

  return (
    <section className="rounded-lg border border-zinc-800/50 bg-zinc-950/40">
      <h3 className="px-3 pt-3 text-sm font-medium text-zinc-300">
        {groupKey} ({cardsInGroup.length})
      </h3>
      <div
        ref={setScrollNode}
        className="flex min-h-0 items-center overflow-x-auto touch-auto snap-x snap-mandatory overscroll-x-contain scroll-smooth"
        onScroll={scheduleCenteredUpdate}
        style={{
          pointerEvents: interactionsDisabled ? "none" : "auto",
          WebkitOverflowScrolling: "touch",
          paddingLeft: `calc(50% - ${Math.round(slotWidthPx / 2)}px)`,
          paddingRight: `calc(50% - ${Math.round(slotWidthPx / 2)}px)`,
          paddingTop: `${rowPaddingY}px`,
          paddingBottom: `${rowPaddingY}px`,
        }}
      >
        {cardsInGroup.map((card, index) => {
          const isFocused = activeCardId === card.id;
          const distance = activeIndex < 0 ? 0 : Math.abs(index - activeIndex);
          const visuals = getCoverFlowVisuals({
            isFocused,
            distance,
            isPinned: pinnedCardId === card.id,
            cardHeightPx: effectiveCardHeightPx,
          });
          return (
            <div
              key={card.id}
              ref={(node) => setItemNode(card.id, node)}
              data-zone-viewer-card-id={card.id}
              data-zone-viewer-focused={isFocused ? "true" : "false"}
              className="shrink-0 transition-transform duration-200 ease-out relative group flex items-start justify-center"
              style={{
                width: slotWidthPx,
                transform: `translateY(${visuals.liftPx}px) scale(${visuals.scale})`,
                zIndex: visuals.zIndex,
                opacity: visuals.opacity,
                scrollSnapAlign: "center",
                scrollSnapStop: "always",
              }}
              onPointerDown={(event) => handlePointerDown(event, card.id)}
              onPointerMove={handlePointerMove}
              onPointerUp={finishPointer}
              onPointerCancel={finishPointer}
              onPointerLeave={finishPointer}
            >
              <div
                className={cn(
                  "relative transition-all duration-200 ease-out",
                  isFocused && "drop-shadow-[0_14px_28px_rgba(99,102,241,0.5)]"
                )}
                style={{ width: effectiveCardWidthPx, height: effectiveCardHeightPx }}
              >
                <CardView
                  card={card}
                  faceDown={false}
                  style={{ width: effectiveCardWidthPx, height: effectiveCardHeightPx }}
                  className="w-full shadow-lg h-full"
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
    </section>
  );
};

export const ZoneViewerGroupedView: React.FC<ZoneViewerGroupedViewProps> = ({
  sortedKeys,
  groupedCards,
  cardWidthPx,
  cardHeightPx,
  interactionsDisabled,
  pinnedCardId,
  onCardContextMenu,
  mobileCoverFlow = false,
}) => {
  const stackOffsetPx = Math.max(24, Math.round(cardHeightPx * 0.2));
  const overlapPx = cardHeightPx - stackOffsetPx;
  const columnWidthPx = Math.round(cardWidthPx + 24);
  const paddingBottomPx = Math.round(cardHeightPx);

  if (mobileCoverFlow) {
    return (
      <div className="h-full min-h-0 overflow-y-auto overflow-x-hidden touch-pan-y">
        <div className="flex min-h-full flex-col justify-center gap-5 py-3">
          {sortedKeys.map((key) => {
            const cardsInGroup = groupedCards[key] ?? [];
            return (
              <MobileGroupedRow
                key={key}
                groupKey={key}
                cardsInGroup={cardsInGroup}
                cardWidthPx={cardWidthPx}
                cardHeightPx={cardHeightPx}
                interactionsDisabled={interactionsDisabled}
                pinnedCardId={pinnedCardId}
                onCardContextMenu={onCardContextMenu}
              />
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-8 h-full">
      {sortedKeys.map((key) => {
        const cardsInGroup = groupedCards[key] ?? [];

        return (
          <GroupedColumn
            key={key}
            groupKey={key}
            cardsInGroup={cardsInGroup}
            cardWidthPx={cardWidthPx}
            cardHeightPx={cardHeightPx}
            interactionsDisabled={interactionsDisabled}
            pinnedCardId={pinnedCardId}
            onCardContextMenu={onCardContextMenu}
            columnWidthPx={columnWidthPx}
            overlapPx={overlapPx}
            paddingBottomPx={paddingBottomPx}
          />
        );
      })}
    </div>
  );
};
