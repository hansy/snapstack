import React from "react";
import { cn } from "@/lib/utils";
import {
  HAND_DEFAULT_HEIGHT,
  HAND_MAX_HEIGHT,
  HAND_MIN_HEIGHT,
  HAND_SNAP_RELEASE_PX,
  HAND_SNAP_THRESHOLD_PX,
} from "./handSizing";

interface BottomBarProps {
  isTop: boolean;
  isRight: boolean;
  children: React.ReactNode;
  className?: string;
  height?: number;
  onHeightChange?: (height: number) => void;
  minHeight?: number;
  maxHeight?: number;
  defaultHeight?: number;
}

export const BottomBar: React.FC<BottomBarProps> = ({
  isTop,
  isRight,
  children,
  className,
  height = HAND_DEFAULT_HEIGHT,
  onHeightChange,
  minHeight: minHeightProp,
  maxHeight: maxHeightProp,
  defaultHeight: defaultHeightProp,
}) => {
  const canResize = Boolean(onHeightChange);
  const minHeight = minHeightProp ?? HAND_MIN_HEIGHT;
  const maxHeight = maxHeightProp ?? HAND_MAX_HEIGHT;
  const defaultHeight = defaultHeightProp ?? HAND_DEFAULT_HEIGHT;
  const [isDragging, setIsDragging] = React.useState(false);
  const [isHovering, setIsHovering] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const snapToDefaultRef = React.useRef(false);
  const dragStartYRef = React.useRef<number | null>(null);
  const dragStartHeightRef = React.useRef<number | null>(null);

  const handleMouseDown = React.useCallback((e: React.MouseEvent) => {
    if (!canResize) return;
    e.preventDefault();
    dragStartYRef.current = e.clientY;
    dragStartHeightRef.current = height;
    setIsDragging(true);
  }, [canResize, height]);

  const handleMouseEnter = React.useCallback(() => {
    if (!canResize) return;
    setIsHovering(true);
  }, [canResize]);

  const handleMouseLeave = React.useCallback(() => {
    setIsHovering(false);
  }, []);

  React.useEffect(() => {
    if (canResize) return;
    setIsDragging(false);
    setIsHovering(false);
  }, [canResize]);

  React.useEffect(() => {
    if (!isDragging || !onHeightChange) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (dragStartYRef.current === null || dragStartHeightRef.current === null) {
        return;
      }
      const delta = isTop
        ? e.clientY - dragStartYRef.current
        : dragStartYRef.current - e.clientY;
      let newHeight = dragStartHeightRef.current + delta;

      // Clamp height between min and max
      newHeight = Math.max(minHeight, Math.min(maxHeight, newHeight));

      // Sticky snap to default height to signal the reset point.
      const snapDistance = Math.abs(newHeight - defaultHeight);
      if (snapToDefaultRef.current) {
        if (snapDistance > HAND_SNAP_RELEASE_PX) {
          snapToDefaultRef.current = false;
        } else {
          newHeight = defaultHeight;
        }
      } else if (snapDistance <= HAND_SNAP_THRESHOLD_PX) {
        snapToDefaultRef.current = true;
        newHeight = defaultHeight;
      }
      onHeightChange(newHeight);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      snapToDefaultRef.current = false;
      dragStartYRef.current = null;
      dragStartHeightRef.current = null;
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      snapToDefaultRef.current = false;
      dragStartYRef.current = null;
      dragStartHeightRef.current = null;
    };
  }, [defaultHeight, isDragging, isTop, maxHeight, minHeight, onHeightChange]);

  const indicatorActive = isDragging || isHovering;

  return (
    <div
      ref={containerRef}
      className={cn(
        "flex w-full shrink-0 relative z-20",
        isRight ? "flex-row-reverse" : "flex-row",
        className
      )}
      style={{
        height: `var(--hand-h, ${height}px)`,
        minHeight: `${minHeight}px`,
        maxHeight: `${maxHeight}px`,
      }}
    >
      {canResize && (
        <>
          <div
            className={cn(
              "absolute left-0 right-0 transition-all pointer-events-none",
              isTop ? "bottom-0" : "top-0",
              indicatorActive ? "h-[2px]" : "h-[1px]",
              isDragging
                ? "bg-indigo-500"
                : indicatorActive
                  ? "bg-indigo-400/50"
                  : "bg-white/5"
            )}
          />
          <div
            className={cn(
              "absolute left-1/2 -translate-x-1/2 pointer-events-none z-20",
              isTop ? "bottom-0 translate-y-1/2" : "top-0 -translate-y-1/2"
            )}
          >
            <div
              className={cn(
                "flex items-center gap-1 rounded-full border px-2 py-[3px] shadow-[0_4px_10px_rgba(0,0,0,0.35)]",
                isDragging
                  ? "border-indigo-400/70 bg-indigo-500/15"
                  : isHovering
                    ? "border-indigo-400/40 bg-zinc-900/90"
                    : "border-white/10 bg-zinc-900/80"
              )}
            >
              <span
                className={cn(
                  "block h-[2px] w-3 rounded-full",
                  isDragging
                    ? "bg-indigo-300"
                    : isHovering
                      ? "bg-indigo-300/80"
                      : "bg-white/20"
                )}
              />
              <span
                className={cn(
                  "block h-[2px] w-3 rounded-full",
                  isDragging
                    ? "bg-indigo-300"
                    : isHovering
                      ? "bg-indigo-300/80"
                      : "bg-white/20"
                )}
              />
            </div>
          </div>

          {/* Resize hit area */}
          <div
            className={cn(
              "absolute left-0 right-0 z-30 cursor-ns-resize",
              isTop ? "bottom-0" : "top-0"
            )}
            style={{
              height: "8px",
              transform: isTop ? "translateY(50%)" : "translateY(-50%)",
            }}
            onMouseDown={handleMouseDown}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          />
        </>
      )}

      {children}
    </div>
  );
};
