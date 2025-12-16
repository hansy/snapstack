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
  highlightColor?: string;
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
  highlightColor?: string;
  disableHoverAnimation?: boolean;
}

export const CardView = React.memo(
  React.forwardRef<HTMLDivElement, CardViewProps>(
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
        highlightColor,
        disableHoverAnimation,
        ...props
      },
      ref
    ) => {
      const customTextNode = React.useMemo(
        () =>
          card.customText ? (
            <div className="bg-zinc-900/90 text-zinc-100 text-sm px-1.5 py-0.5 rounded-sm border border-zinc-700 shadow-sm leading-tight whitespace-normal break-words">
              {card.customText}
            </div>
          ) : null,
        [card.customText]
      );

      return (
        <div
          ref={ref}
          style={style}
          className={cn(
            CARD_HEIGHT_CLASS,
            CARD_ASPECT_CLASS,
            "bg-zinc-800 rounded-lg border border-zinc-700 shadow-md flex flex-col items-center justify-center select-none relative z-0",
            !isDragging && !disableHoverAnimation &&
            "hover:scale-105 hover:shadow-xl hover:z-10 hover:border-indigo-500/50 cursor-grab active:cursor-grabbing",
            card.tapped && "border-zinc-600 bg-zinc-900",
            isDragging &&
            "shadow-[0_20px_50px_rgba(0,0,0,0.5)] ring-2 ring-indigo-500 cursor-grabbing",
            highlightColor === "rose" && "ring-2 ring-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.5)]",
            highlightColor === "violet" && "ring-2 ring-violet-500 shadow-[0_0_15px_rgba(139,92,246,0.5)]",
            highlightColor === "sky" && "ring-2 ring-sky-500 shadow-[0_0_15px_rgba(14,165,233,0.5)]",
            highlightColor === "amber" && "ring-2 ring-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.5)]",
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
            customTextPosition="top-left"
            customTextNode={customTextNode}
          />
        </div>
      );
    }
  )
);

const CardInner: React.FC<CardProps> = ({
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
  highlightColor,
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
  const zoneType = useGameStore((state) => state.zones[card.zoneId]?.type);
  const myPlayerId = useGameStore((state) => state.myPlayerId);
  const tapCard = useGameStore((state) => state.tapCard);
  const useArtCrop = preferArtCrop ?? false;

  // Memoize style computation
  const style = React.useMemo<React.CSSProperties>(() => {
    const { transform: propTransform, ...restPropStyle } = propStyle || {};
    const transformParts: string[] = [];
    if (typeof propTransform === "string") transformParts.push(propTransform);
    if (scale && scale !== 1) transformParts.push(`scale(${scale})`);
    if (card.tapped) transformParts.push("rotate(90deg)");

    return {
      ...restPropStyle,
      transform: transformParts.length ? transformParts.join(" ") : undefined,
      transformOrigin: "center center",
      opacity: isDragging ? 0 : 1,
    };
  }, [propStyle, scale, card.tapped, isDragging]);

  // Memoize image transform
  const imageTransform = React.useMemo(() => {
    const flipRotation = getFlipRotation(card);
    return flipRotation ? `rotate(${flipRotation}deg)` : undefined;
  }, [card.scryfall?.layout, card.currentFaceIndex]);

  // Hover Logic
  const hoverTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  const handleMouseEnter = React.useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (isDragging) return;
      // Allow preview if faceDown ONLY if we are the owner
      const isOwner = card.ownerId === myPlayerId;
      if (faceDown && !isOwner) return;

      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = null;
      }

      const rect = e.currentTarget.getBoundingClientRect();

      if (zoneType === ZONE.HAND) {
        // Only allowing hover jump/preview for MY hand (or if I own the card)
        if (card.ownerId === myPlayerId) {
          showPreview(card, rect);
        }
      } else if (zoneType === ZONE.COMMANDER) {
        showPreview(card, rect);
      } else if (zoneType === ZONE.BATTLEFIELD) {
        hoverTimeoutRef.current = setTimeout(() => {
          showPreview(card, rect);
          hoverTimeoutRef.current = null;
        }, 250);
      }
    },
    [isDragging, card, faceDown, myPlayerId, zoneType, showPreview]
  );

  const handleMouseLeave = React.useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    hidePreview();
  }, [hidePreview]);

  const handleClick = React.useCallback(
    (e: React.MouseEvent) => {
      // Allow locking in Battlefield AND Hand (if it's my hand)
      const allowedInHand = zoneType === ZONE.HAND && card.ownerId === myPlayerId;
      if ((zoneType !== ZONE.BATTLEFIELD && !allowedInHand) || isDragging) return;

      const rect = e.currentTarget.getBoundingClientRect();
      toggleLock(card, rect);
    },
    [zoneType, isDragging, card, myPlayerId, toggleLock]
  );

  const handleDoubleClick = React.useCallback(() => {
    if (zoneType !== ZONE.BATTLEFIELD) return;
    if (card.ownerId !== myPlayerId) return;
    tapCard(card.id, myPlayerId);
  }, [zoneType, card.id, card.ownerId, myPlayerId, tapCard]);

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
      hidePreview();
    };
  }, [hidePreview]);

  // Disable hover animation for opponent hands
  const disableHoverAnimation = zoneType === ZONE.HAND && card.ownerId !== myPlayerId;

  return (
    <CardView
      ref={setNodeRef}
      card={card}
      style={style}
      className={className}
      onContextMenu={onContextMenu}
      faceDown={faceDown}
      isDragging={isDragging}
      onDoubleClick={handleDoubleClick}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      imageClassName={undefined}
      imageTransform={imageTransform}
      preferArtCrop={useArtCrop}
      rotateLabel={rotateLabel}
      highlightColor={highlightColor}
      disableHoverAnimation={disableHoverAnimation}
      {...listeners}
      {...attributes}
    />
  );
};

export const Card = React.memo(CardInner);
