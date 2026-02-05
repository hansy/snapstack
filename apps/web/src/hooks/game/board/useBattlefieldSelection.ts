import * as React from "react";

import type { Card, ZoneId } from "@/types";
import { useSelectionStore } from "@/store/selectionStore";
import { fromNormalizedPosition, mirrorNormalizedY } from "@/lib/positions";
import { getEffectiveCardSize } from "@/lib/dndBattlefield";

type SelectionRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type PointerSnapshot = {
  pointerId: number;
  clientX: number;
  clientY: number;
};

type CardBounds = {
  id: string;
  left: number;
  right: number;
  top: number;
  bottom: number;
};

type UseBattlefieldSelectionArgs = {
  zoneId: ZoneId;
  cards: Card[];
  zoneSize: { width: number; height: number };
  scale: number;
  viewScale: number;
  baseCardHeight?: number;
  baseCardWidth?: number;
  mirrorBattlefieldY: boolean;
  zoneNodeRef: React.RefObject<HTMLDivElement | null>;
  isSelectionEnabled: boolean;
};

export const useBattlefieldSelection = ({
  zoneId,
  cards,
  zoneSize,
  scale,
  viewScale,
  baseCardHeight,
  baseCardWidth,
  mirrorBattlefieldY,
  zoneNodeRef,
  isSelectionEnabled,
}: UseBattlefieldSelectionArgs) => {
  const setSelection = useSelectionStore((state) => state.setSelection);
  const [selectionRect, setSelectionRect] = React.useState<SelectionRect | null>(
    null
  );
  const selectionDragRef = React.useRef<{
    pointerId: number;
    start: { x: number; y: number };
    baseSelection: Set<string>;
    shiftKey: boolean;
  } | null>(null);
  const pendingFrame = React.useRef<number | null>(null);
  const latestMove = React.useRef<PointerSnapshot | null>(null);

  const cardBounds = React.useMemo<CardBounds[]>(() => {
    if (!isSelectionEnabled) return [];
    if (!zoneSize.width || !zoneSize.height) return [];
    return cards.map((card) => {
      const viewPosition = mirrorBattlefieldY
        ? mirrorNormalizedY(card.position)
        : card.position;
      const center = fromNormalizedPosition(
        viewPosition,
        zoneSize.width,
        zoneSize.height
      );
      const { cardWidth, cardHeight } = getEffectiveCardSize({
        viewScale,
        isTapped: card.tapped,
        baseCardHeight,
        baseCardWidth,
      });
      const left = center.x - cardWidth / 2;
      const top = center.y - cardHeight / 2;
      return {
        id: card.id,
        left,
        right: left + cardWidth,
        top,
        bottom: top + cardHeight,
      };
    });
  }, [
    cards,
    isSelectionEnabled,
    mirrorBattlefieldY,
    viewScale,
    baseCardHeight,
    baseCardWidth,
    zoneSize.height,
    zoneSize.width,
  ]);

  const clampRectToZone = React.useCallback(
    (rect: SelectionRect) => {
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
    },
    [zoneSize.height, zoneSize.width]
  );

  const getSelectionRect = React.useCallback(
    (start: { x: number; y: number }, current: { x: number; y: number }) => {
      const left = Math.min(start.x, current.x);
      const top = Math.min(start.y, current.y);
      const width = Math.abs(current.x - start.x);
      const height = Math.abs(current.y - start.y);
      return clampRectToZone({ x: left, y: top, width, height });
    },
    [clampRectToZone]
  );

  const getIdsInRect = React.useCallback(
    (rect: SelectionRect) => {
      const rectLeft = rect.x;
      const rectRight = rect.x + rect.width;
      const rectTop = rect.y;
      const rectBottom = rect.y + rect.height;

      const ids: string[] = [];
      cardBounds.forEach((bounds) => {
        const intersects =
          rectRight >= bounds.left &&
          rectLeft <= bounds.right &&
          rectBottom >= bounds.top &&
          rectTop <= bounds.bottom;
        if (intersects) ids.push(bounds.id);
      });
      return ids;
    },
    [cardBounds]
  );

  const toggleSelection = React.useCallback(
    (baseSelection: Set<string>, ids: string[]) => {
      const next = new Set(baseSelection);
      ids.forEach((id) => {
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
      });
      return Array.from(next);
    },
    []
  );

  const getLocalPoint = React.useCallback(
    (point: { clientX: number; clientY: number }) => {
      const node = zoneNodeRef.current;
      if (!node) return null;
      const rect = node.getBoundingClientRect();
      const safeScale = scale || 1;
      return {
        x: (point.clientX - rect.left) / safeScale,
        y: (point.clientY - rect.top) / safeScale,
      };
    },
    [scale, zoneNodeRef]
  );

  const updateSelectionFromPoint = React.useCallback(
    (point: PointerSnapshot) => {
      const selection = selectionDragRef.current;
      if (!selection || selection.pointerId !== point.pointerId) return;

      const localPoint = getLocalPoint(point);
      if (!localPoint) return;

      const rect = getSelectionRect(selection.start, localPoint);
      setSelectionRect(rect);

      const idsInRect = getIdsInRect(rect);
      const nextIds = selection.shiftKey
        ? toggleSelection(selection.baseSelection, idsInRect)
        : idsInRect;
      setSelection(nextIds, zoneId);
    },
    [
      getIdsInRect,
      getLocalPoint,
      getSelectionRect,
      setSelection,
      toggleSelection,
      zoneId,
    ]
  );

  const scheduleSelectionUpdate = React.useCallback(
    (point: PointerSnapshot) => {
      latestMove.current = point;
      if (pendingFrame.current) return;
      pendingFrame.current = requestAnimationFrame(() => {
        pendingFrame.current = null;
        const latest = latestMove.current;
        latestMove.current = null;
        if (latest) updateSelectionFromPoint(latest);
      });
    },
    [updateSelectionFromPoint]
  );

  const handlePointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!isSelectionEnabled) return;
      if (event.button !== 0) return;
      if (event.target instanceof HTMLElement && event.target.closest("[data-card-id]")) return;

      const localPoint = getLocalPoint({
        clientX: event.clientX,
        clientY: event.clientY,
      });
      if (!localPoint) return;

      const selectionState = useSelectionStore.getState();
      const baseSelection =
        selectionState.selectionZoneId === zoneId
          ? selectionState.selectedCardIds
          : [];

      selectionDragRef.current = {
        pointerId: event.pointerId,
        start: localPoint,
        baseSelection: new Set(baseSelection),
        shiftKey: event.shiftKey,
      };
      zoneNodeRef.current?.setPointerCapture(event.pointerId);
      setSelectionRect({
        x: localPoint.x,
        y: localPoint.y,
        width: 0,
        height: 0,
      });
    },
    [getLocalPoint, isSelectionEnabled, zoneId, zoneNodeRef]
  );

  const handlePointerMove = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (
        !selectionDragRef.current ||
        selectionDragRef.current.pointerId !== event.pointerId
      ) {
        return;
      }
      scheduleSelectionUpdate({
        pointerId: event.pointerId,
        clientX: event.clientX,
        clientY: event.clientY,
      });
    },
    [scheduleSelectionUpdate]
  );

  const handlePointerUp = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (
        !selectionDragRef.current ||
        selectionDragRef.current.pointerId !== event.pointerId
      ) {
        return;
      }
      if (pendingFrame.current) {
        cancelAnimationFrame(pendingFrame.current);
        pendingFrame.current = null;
        latestMove.current = null;
      }

      updateSelectionFromPoint({
        pointerId: event.pointerId,
        clientX: event.clientX,
        clientY: event.clientY,
      });
      zoneNodeRef.current?.releasePointerCapture(event.pointerId);
      selectionDragRef.current = null;
      setSelectionRect(null);
    },
    [updateSelectionFromPoint, zoneNodeRef]
  );

  const handlePointerCancel = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (
        !selectionDragRef.current ||
        selectionDragRef.current.pointerId !== event.pointerId
      ) {
        return;
      }
      if (pendingFrame.current) {
        cancelAnimationFrame(pendingFrame.current);
        pendingFrame.current = null;
        latestMove.current = null;
      }
      zoneNodeRef.current?.releasePointerCapture(event.pointerId);
      selectionDragRef.current = null;
      setSelectionRect(null);
    },
    [zoneNodeRef]
  );

  React.useEffect(() => () => {
    if (pendingFrame.current) {
      cancelAnimationFrame(pendingFrame.current);
      pendingFrame.current = null;
    }
  }, []);

  return {
    selectionRect,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
  };
};
