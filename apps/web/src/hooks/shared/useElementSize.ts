import * as React from "react";

export type ElementSize = { width: number; height: number };

export interface UseElementSizeOptions {
  debounceMs?: number;
  thresholdPx?: number;
  initialSize?: ElementSize;
}

export const useElementSize = <T extends Element>({
  debounceMs = 16,
  thresholdPx = 1,
  initialSize = { width: 0, height: 0 },
}: UseElementSizeOptions = {}) => {
  const [node, setNode] = React.useState<T | null>(null);
  const [size, setSize] = React.useState<ElementSize>(initialSize);
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const ref = React.useCallback((nextNode: T | null) => {
    setNode(nextNode);
  }, []);

  React.useEffect(() => {
    if (!node) return;

    if (typeof ResizeObserver === "undefined") {
      const rect = node.getBoundingClientRect?.();
      if (rect) {
        setSize({ width: rect.width, height: rect.height });
      }
      return;
    }

    const threshold = Math.max(0, thresholdPx);

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry?.contentRect) return;
      const { width, height } = entry.contentRect;

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      const commit = () => {
        setSize((prev) => {
          const widthDelta = Math.abs(prev.width - width);
          const heightDelta = Math.abs(prev.height - height);

          if (widthDelta > threshold || heightDelta > threshold) {
            return { width, height };
          }

          return prev;
        });
      };

      if (debounceMs <= 0) {
        commit();
        return;
      }

      timeoutRef.current = setTimeout(commit, debounceMs);
    });

    observer.observe(node);

    return () => {
      observer.disconnect();
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [debounceMs, node, thresholdPx]);

  return { ref, size };
};

