import React from "react";
import { useDraggable } from "@dnd-kit/core";
import { Card as CardType } from "../../../types";
import { cn } from "../../../lib/utils";
import { useGameStore } from "../../../store/gameStore";
import { CARD_HEIGHT, CARD_ASPECT_RATIO } from "../../../lib/constants";
import { ZONE } from "../../../constants/zones";

import { CardFace } from "./CardFace";
import { useCardPreview } from "./CardPreviewProvider";

interface CardProps {
  card: CardType;
  style?: React.CSSProperties;
  className?: string;
  onContextMenu?: (e: React.MouseEvent) => void;
  faceDown?: boolean;
  scale?: number;
}

export interface CardViewProps {
  card: CardType;
  style?: React.CSSProperties;
  className?: string;
  imageClassName?: string;
  onContextMenu?: (e: React.MouseEvent) => void;
  faceDown?: boolean;
  isDragging?: boolean;
  onDoubleClick?: () => void;
  onMouseEnter?: (e: React.MouseEvent<HTMLDivElement>) => void;
  onMouseLeave?: (e: React.MouseEvent<HTMLDivElement>) => void;
}

export const CardView = React.forwardRef<HTMLDivElement, CardViewProps>(
  (
    {
      card,
      style,
      className,
      imageClassName,
      onContextMenu,
      faceDown,
      isDragging,
      onDoubleClick,
      onMouseEnter,
      onMouseLeave,
      ...props
    },
    ref
  ) => {
    return (
      <div
        ref={ref}
        style={style}
        className={cn(
          CARD_HEIGHT,
          CARD_ASPECT_RATIO,
          "bg-zinc-800 rounded-lg border border-zinc-700 shadow-md flex flex-col items-center justify-center select-none relative",
          !isDragging &&
            "hover:scale-105 hover:shadow-xl hover:z-10 hover:border-indigo-500/50 cursor-grab active:cursor-grabbing",
          card.tapped && "border-zinc-600 bg-zinc-900",
          isDragging &&
            "shadow-[0_20px_50px_rgba(0,0,0,0.5)] ring-2 ring-indigo-500 cursor-grabbing",
          className
        )}
        onDoubleClick={onDoubleClick}
        onContextMenu={onContextMenu}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        {...props}
      >
        <CardFace
          card={card}
          faceDown={faceDown}
          imageClassName={imageClassName}
        />
      </div>
    );
  }
);

export const Card: React.FC<CardProps> = ({
  card,
  style: propStyle,
  className,
  onContextMenu,
  faceDown,
}) => {
  const { showPreview, hidePreview } = useCardPreview();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: card.id,
    data: {
      cardId: card.id,
      zoneId: card.zoneId,
      ownerId: card.ownerId,
      tapped: card.tapped,
    },
  });

  const { transform: propTransform, ...restPropStyle } = propStyle || {};

  // Compose transforms
  const transformParts: string[] = [];
  if (typeof propTransform === "string") transformParts.push(propTransform);
  if (card.tapped) transformParts.push("rotate(90deg)");

  const style: React.CSSProperties = {
    ...restPropStyle,
    transform: transformParts.length ? transformParts.join(" ") : undefined,
    transformOrigin: "center center",
    opacity: isDragging ? 0 : 1, // Hide original when dragging
  };

  // Hover Logic
  const hoverTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnter = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isDragging || faceDown) return;

    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }

    const rect = e.currentTarget.getBoundingClientRect();

    if (card.zoneId.includes(ZONE.HAND)) {
      showPreview(card, rect);
    } else if (card.zoneId.includes(ZONE.BATTLEFIELD)) {
      hoverTimeoutRef.current = setTimeout(() => {
        showPreview(card, rect);
        hoverTimeoutRef.current = null;
      }, 250);
    }
  };

  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    hidePreview();
  };

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  return (
    <>
      <CardView
        ref={setNodeRef}
        card={card}
        style={style}
        className={className}
        onContextMenu={onContextMenu}
        faceDown={faceDown}
        isDragging={isDragging}
        onDoubleClick={() => useGameStore.getState().tapCard(card.id)}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        {...listeners}
        {...attributes}
      />
    </>
  );
};
