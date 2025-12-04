import React from "react";
import { useDraggable } from "@dnd-kit/core";
import { Card as CardType } from "../../../types";
import { cn } from "../../../lib/utils";
import { useGameStore } from "../../../store/gameStore";
import { CARD_HEIGHT, CARD_ASPECT_RATIO } from "../../../lib/constants";
import { ZONE } from "../../../constants/zones";

import { CardFace } from "./CardFace";
import { useCardPreview } from "./CardPreviewProvider";
import { getFlipRotation } from "../../../lib/cardDisplay";

interface CardProps {
  card: CardType;
  style?: React.CSSProperties;
  className?: string;
  onContextMenu?: (e: React.MouseEvent) => void;
  faceDown?: boolean;
  scale?: number;
  preferArtCrop?: boolean;
  rotateLabel?: boolean;
}

export interface CardViewProps {
  card: CardType;
  style?: React.CSSProperties;
  className?: string;
  imageClassName?: string;
  imageTransform?: string;
  preferArtCrop?: boolean;
  onContextMenu?: (e: React.MouseEvent) => void;
  faceDown?: boolean;
  isDragging?: boolean;
  rotateLabel?: boolean;
  onDoubleClick?: () => void;
  onClick?: (e: React.MouseEvent) => void;
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
      onClick,
      onMouseEnter,
      onMouseLeave,
      imageTransform,
      preferArtCrop = true,
      rotateLabel,
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
          "bg-zinc-800 rounded-lg border border-zinc-700 shadow-md flex flex-col items-center justify-center select-none relative z-0",
          !isDragging &&
          "hover:scale-105 hover:shadow-xl hover:z-10 hover:border-indigo-500/50 cursor-grab active:cursor-grabbing",
          card.tapped && "border-zinc-600 bg-zinc-900",
          isDragging &&
          "shadow-[0_20px_50px_rgba(0,0,0,0.5)] ring-2 ring-indigo-500 cursor-grabbing",
          className
        )}
        onDoubleClick={onDoubleClick}
        onClick={onClick}
        onContextMenu={onContextMenu}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        {...props}
      >
        <CardFace
          card={card}
          faceDown={faceDown}
          imageClassName={imageClassName}
          imageTransform={imageTransform}
          preferArtCrop={preferArtCrop}
          rotateLabel={rotateLabel}
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
  scale = 1,
  preferArtCrop,
  rotateLabel,
}) => {
  const { showPreview, hidePreview, toggleLock } = useCardPreview();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: card.id,
    data: {
      cardId: card.id,
      zoneId: card.zoneId,
      ownerId: card.ownerId,
      tapped: card.tapped,
    },
  });
  const zone = useGameStore((state) => state.zones[card.zoneId]);
  const cardTypeLine = card.typeLine || card.scryfall?.type_line || "";
  const isLand = /land/i.test(cardTypeLine);
  const isBattlefield = zone?.type === ZONE.BATTLEFIELD;
  const useArtCrop = preferArtCrop ?? (!isLand && isBattlefield);

  const { transform: propTransform, ...restPropStyle } = propStyle || {};

  // Compose transforms
  const transformParts: string[] = [];
  if (typeof propTransform === "string") transformParts.push(propTransform);
  if (scale && scale !== 1) transformParts.push(`scale(${scale})`);
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
    if (isDragging) return;
    // Allow preview if faceDown ONLY if we are the owner
    const isOwner = card.ownerId === useGameStore.getState().myPlayerId;
    if (faceDown && !isOwner) return;

    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }

    const rect = e.currentTarget.getBoundingClientRect();

    if (card.zoneId.includes(ZONE.HAND) || card.zoneId.includes(ZONE.COMMANDER)) {
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

  const handleClick = (e: React.MouseEvent) => {
    if (card.zoneId.includes(ZONE.BATTLEFIELD) && !isDragging) {
      const rect = e.currentTarget.getBoundingClientRect();
      toggleLock(card, rect);
    }
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
        onDoubleClick={() => {
          const state = useGameStore.getState();
          const zone = state.zones[card.zoneId];
          if (zone?.type !== ZONE.BATTLEFIELD) return;
          state.tapCard(card.id, state.myPlayerId);
        }}
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        imageClassName={undefined}
        imageTransform={
          (() => {
            const flipRotation = getFlipRotation(card);
            return flipRotation ? `rotate(${flipRotation}deg)` : undefined;
          })()
        }
        preferArtCrop={useArtCrop}
        rotateLabel={rotateLabel}
        {...listeners}
        {...attributes}
      />
    </>
  );
};
