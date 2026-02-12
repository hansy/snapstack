import * as React from "react";

type CenterBehavior = "auto" | "smooth";

export const getCoverFlowVisuals = (params: {
  isFocused: boolean;
  distance: number;
  isPinned?: boolean;
  cardHeightPx: number;
}) => {
  const { isFocused, distance, isPinned = false, cardHeightPx } = params;
  const safeDistance = Math.max(0, distance);
  const scale = isPinned
    ? 1.1
    : isFocused
      ? 1.1
      : Math.max(0.8, 1 - safeDistance * 0.08);
  const opacity = isFocused
    ? 1
    : Math.max(0.4, 0.84 - safeDistance * 0.18);
  const zIndex = isPinned ? 300 : isFocused ? 200 : 150 - safeDistance;
  const liftPx = isFocused ? -Math.round(cardHeightPx * 0.03) : 0;
  return { scale, opacity, zIndex, liftPx };
};

export const useHorizontalCoverFlow = (params: {
  enabled: boolean;
  itemIds: string[];
  scrollNode: HTMLDivElement | null;
}) => {
  const { enabled, itemIds, scrollNode } = params;
  const [centeredId, setCenteredId] = React.useState<string | null>(null);
  const itemNodesRef = React.useRef<Map<string, HTMLDivElement>>(new Map());
  const updateRafRef = React.useRef<number | null>(null);
  const centeredListKeyRef = React.useRef<string | null>(null);

  const setItemNode = React.useCallback((itemId: string, node: HTMLDivElement | null) => {
    if (node) {
      itemNodesRef.current.set(itemId, node);
    } else {
      itemNodesRef.current.delete(itemId);
    }
  }, []);

  const centerItemInViewport = React.useCallback(
    (itemId: string, behavior: CenterBehavior = "smooth") => {
      if (!scrollNode) return;
      const itemNode = itemNodesRef.current.get(itemId);
      if (!itemNode) return;
      const itemCenter = itemNode.offsetLeft + itemNode.offsetWidth / 2;
      const nextLeft = Math.max(0, itemCenter - scrollNode.clientWidth / 2);
      if (typeof scrollNode.scrollTo === "function") {
        scrollNode.scrollTo({ left: nextLeft, behavior });
      } else {
        scrollNode.scrollLeft = nextLeft;
      }
    },
    [scrollNode]
  );

  const updateCenteredItem = React.useCallback(() => {
    if (!enabled || !scrollNode || itemIds.length === 0) return;
    const listRect = scrollNode.getBoundingClientRect();
    const viewportCenterX = listRect.left + listRect.width / 2;
    let nextId: string | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    itemIds.forEach((itemId) => {
      const node = itemNodesRef.current.get(itemId);
      if (!node) return;
      const rect = node.getBoundingClientRect();
      const itemCenterX = rect.left + rect.width / 2;
      const distance = Math.abs(itemCenterX - viewportCenterX);
      if (distance < bestDistance) {
        bestDistance = distance;
        nextId = itemId;
      }
    });
    if (nextId) {
      setCenteredId((prev) => (prev === nextId ? prev : nextId));
    }
  }, [enabled, itemIds, scrollNode]);

  const scheduleCenteredUpdate = React.useCallback(() => {
    if (!enabled || typeof window === "undefined") return;
    if (updateRafRef.current !== null) return;
    updateRafRef.current = window.requestAnimationFrame(() => {
      updateRafRef.current = null;
      updateCenteredItem();
    });
  }, [enabled, updateCenteredItem]);

  const itemListKey = React.useMemo(() => itemIds.join("|"), [itemIds]);

  React.useEffect(() => {
    if (!enabled) {
      setCenteredId(null);
      centeredListKeyRef.current = null;
      return;
    }
    if (itemIds.length === 0) {
      setCenteredId(null);
      centeredListKeyRef.current = null;
      return;
    }

    const firstId = itemIds[0] ?? null;
    if (!firstId || !scrollNode) return;
    const shouldAutoCenter = centeredListKeyRef.current !== itemListKey;
    if (shouldAutoCenter) {
      centeredListKeyRef.current = itemListKey;
      setCenteredId(firstId);
      if (typeof window !== "undefined") {
        window.requestAnimationFrame(() => {
          centerItemInViewport(firstId, "auto");
          scheduleCenteredUpdate();
        });
      }
      return;
    }

    if (centeredId && itemIds.includes(centeredId)) return;
    setCenteredId(firstId);
  }, [
    centerItemInViewport,
    centeredId,
    enabled,
    itemIds,
    itemListKey,
    scheduleCenteredUpdate,
    scrollNode,
  ]);

  React.useEffect(() => {
    return () => {
      if (updateRafRef.current !== null && typeof window !== "undefined") {
        window.cancelAnimationFrame(updateRafRef.current);
      }
    };
  }, []);

  return {
    centeredId,
    setCenteredId,
    setItemNode,
    scheduleCenteredUpdate,
  };
};
