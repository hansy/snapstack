import React from "react";
import { useDraggable } from "@dnd-kit/core";
import { Card as CardType } from "../../../types";
import { cn } from "../../../lib/utils";
import { useGameStore } from "../../../store/gameStore";
import { CARD_HEIGHT_CLASS, CARD_ASPECT_CLASS } from "../../../lib/constants";
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
  disableDrag?: boolean;
  isDragging?: boolean;
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
      preferArtCrop = false,
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
          CARD_HEIGHT_CLASS,
          CARD_ASPECT_CLASS,
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
          customTextPosition="bottom-left"
          customTextNode={
            card.customText ? (
              <div className="bg-zinc-900/90 text-zinc-100 text-sm px-1.5 py-0.5 rounded-sm border border-zinc-700 shadow-sm leading-tight whitespace-normal break-words">
                {card.customText}
              </div>
            ) : null
          }
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
  disableDrag,
  isDragging: propIsDragging,
}) => {
  const { showPreview, hidePreview, toggleLock } = useCardPreview();
  const {
    attributes,
    listeners,
    setNodeRef,
    isDragging: internalIsDragging,
  } = useDraggable({
    id: card.id,
    data: {
      cardId: card.id,
      zoneId: card.zoneId,
      ownerId: card.ownerId,
      tapped: card.tapped,
    },
    disabled: disableDrag,
  });

  const isDragging = propIsDragging ?? internalIsDragging;
  const zone = useGameStore((state) => state.zones[card.zoneId]);
  const zoneType = zone?.type;
  const cardTypeLine = card.typeLine || "";
  const isLand = /land/i.test(cardTypeLine);
  const isBattlefield = zoneType === ZONE.BATTLEFIELD;
  const useArtCrop = preferArtCrop ?? false;

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
  const hoverTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

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

    if (zoneType === ZONE.HAND || zoneType === ZONE.COMMANDER) {
      showPreview(card, rect);
    } else if (zoneType === ZONE.BATTLEFIELD) {
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
    const state = useGameStore.getState();
    if (zoneType !== ZONE.BATTLEFIELD || isDragging) return;
    if (card.ownerId !== state.myPlayerId) return;

    const rect = e.currentTarget.getBoundingClientRect();
    toggleLock(card, rect);
  };

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
      hidePreview();
    };
  }, [hidePreview]);

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
          if (card.ownerId !== state.myPlayerId) return;
          state.tapCard(card.id, state.myPlayerId);
        }}
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        imageClassName={undefined}
        imageTransform={(() => {
          const flipRotation = getFlipRotation(card);
          return flipRotation ? `rotate(${flipRotation}deg)` : undefined;
        })()}
        preferArtCrop={useArtCrop}
        rotateLabel={rotateLabel}
        {...listeners}
        {...attributes}
      />
    </>
  );
};
