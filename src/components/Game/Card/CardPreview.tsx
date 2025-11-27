import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Card as CardType } from "../../../types";
import { CARD_ASPECT_RATIO } from "../../../lib/constants";
import { cn } from "../../../lib/utils";

interface CardPreviewProps {
  card: CardType;
  anchorRect: DOMRect;
  width?: number;
}

const PREVIEW_WIDTH = 180; // Reduced size
const GAP = 16;

export const CardPreview: React.FC<CardPreviewProps> = ({
  card,
  anchorRect,
  width = PREVIEW_WIDTH,
}) => {
  const [style, setStyle] = useState<{
    top: number;
    left: number;
    opacity: number;
  }>({ top: 0, left: 0, opacity: 0 });
  const [isPositioned, setIsPositioned] = useState(false);

  useEffect(() => {
    const calculatePosition = () => {
      const calculatedHeight = width * 1.4;

      let top = anchorRect.top - calculatedHeight - GAP;
      let left = anchorRect.left + anchorRect.width / 2 - width / 2;

      // Viewport Collision Detection
      // Default is ABOVE.
      // If it goes off the TOP, try BELOW.
      if (top < GAP) {
        const topBelow = anchorRect.bottom + GAP;
        // Check if BELOW fits in the viewport
        if (topBelow + calculatedHeight <= window.innerHeight - GAP) {
          top = topBelow;
        } else {
          // If neither fits perfectly, pick the one with MORE space or clamp?
          // For now, if top is cut off, we force below, but we might need to clamp it to bottom edge if it's too tall?
          // Actually, if it's too tall for below, it will be cropped.
          // Let's try to keep it on screen.
          if (topBelow + calculatedHeight > window.innerHeight) {
            // If below is also too big, maybe align to bottom?
            // But we want it near the card.
            // Let's just stick to the logic: if top is bad, go below.
            top = topBelow;
          }
        }
      }

      // Clamp left to viewport
      const maxLeft = window.innerWidth - width - GAP;
      left = Math.max(GAP, Math.min(left, maxLeft));

      setStyle({ top, left, opacity: 1 });
      setIsPositioned(true);
    };

    // Run immediately
    calculatePosition();

    // Optional: Re-calculate on scroll/resize
    // window.addEventListener('resize', calculatePosition);
    // window.addEventListener('scroll', calculatePosition);
    // return () => { ... }
  }, [anchorRect]);

  // Don't render until positioned to avoid jump
  if (!isPositioned) return null;

  return createPortal(
    <div
      className={cn(
        "fixed z-[9999] pointer-events-none rounded-xl shadow-2xl border-2 border-indigo-500/50 bg-zinc-900 overflow-hidden transition-opacity duration-200 ease-out",
        CARD_ASPECT_RATIO
      )}
      style={{
        top: style.top,
        left: style.left,
        width: width,
        opacity: style.opacity,
      }}
    >
      {card.imageUrl ? (
        <img
          src={card.imageUrl}
          alt={card.name}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center p-4 text-center">
          <div className="text-lg font-bold text-zinc-200">{card.name}</div>
        </div>
      )}
      {/* Counters Overlay */}
      {card.counters.length > 0 && (
        <div className="absolute top-2 right-2 flex gap-1">
          {card.counters.map((counter, i) => (
            <div
              key={i}
              className="bg-indigo-600 text-white text-xs px-2 py-1 rounded-full shadow-sm border border-indigo-400"
            >
              {counter.count}
            </div>
          ))}
        </div>
      )}
    </div>,
    document.body
  );
};
