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
}

export const BottomBar: React.FC<BottomBarProps> = ({
  isTop,
  isRight,
  children,
  className,
  height = HAND_DEFAULT_HEIGHT,
  onHeightChange,
}) => {
  const [isDragging, setIsDragging] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const snapToDefaultRef = React.useRef(false);
  const dragStartYRef = React.useRef<number | null>(null);
  const dragStartHeightRef = React.useRef<number | null>(null);

  const handleMouseDown = React.useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragStartYRef.current = e.clientY;
    dragStartHeightRef.current = height;
    setIsDragging(true);
  }, [height]);

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
      newHeight = Math.max(HAND_MIN_HEIGHT, Math.min(HAND_MAX_HEIGHT, newHeight));

      // Sticky snap to default height to signal the reset point.
      const snapDistance = Math.abs(newHeight - HAND_DEFAULT_HEIGHT);
      if (snapToDefaultRef.current) {
        if (snapDistance > HAND_SNAP_RELEASE_PX) {
          snapToDefaultRef.current = false;
        } else {
          newHeight = HAND_DEFAULT_HEIGHT;
        }
      } else if (snapDistance <= HAND_SNAP_THRESHOLD_PX) {
        snapToDefaultRef.current = true;
        newHeight = HAND_DEFAULT_HEIGHT;
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
  }, [isDragging, isTop, onHeightChange]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "flex w-full shrink-0 relative z-20",
        isRight ? "flex-row-reverse" : "flex-row",
        className
      )}
      style={{ height: `${height}px` }}
    >
      {/* Resize handle */}
      <div
        className={cn(
          "absolute left-0 right-0 z-30 group",
          isTop ? "bottom-0" : "top-0"
        )}
        onMouseDown={handleMouseDown}
      >
        {/* Hit area */}
        <div
          className={cn(
            "absolute left-0 right-0 cursor-ns-resize",
            isTop ? "bottom-0" : "top-0"
          )}
          style={{
            height: "8px",
            transform: isTop ? "translateY(50%)" : "translateY(-50%)",
          }}
        />

        {/* Visual indicator */}
        <div
          className={cn(
            "absolute left-0 right-0 h-[1px] transition-all",
            isTop
              ? "bottom-0 border-b border-white/5"
              : "top-0 border-t border-white/5",
            isDragging
              ? "bg-indigo-500 h-[2px]"
              : "bg-white/5 group-hover:bg-indigo-400/50 group-hover:h-[2px]"
          )}
        />
      </div>

      {children}
    </div>
  );
};
