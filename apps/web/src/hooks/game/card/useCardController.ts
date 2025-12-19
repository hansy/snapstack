import React from "react";
import { useDraggable } from "@dnd-kit/core";

import { useGameStore } from "@/store/gameStore";
import { ZONE } from "@/constants/zones";

import { useCardPreview } from "@/components/game/card/CardPreviewProvider";
import { canViewerSeeCardIdentity } from "@/lib/reveal";
import { getFlipRotation } from "@/lib/cardDisplay";
import {
  canToggleCardPreviewLock,
  computeCardContainerStyle,
  getCardHoverPreviewPolicy,
  shouldDisableHoverAnimation,
} from "@/models/game/card/cardModel";

import type { CardProps, CardViewProps } from "@/components/game/card/types";

export type CardController = {
  ref: (node: HTMLElement | null) => void;
  draggableProps: Record<string, unknown>;
  cardViewProps: CardViewProps;
};

export const useCardController = (props: CardProps): CardController => {
  const {
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
  } = props;

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

  const canPeek = React.useMemo(
    () => canViewerSeeCardIdentity(card, zoneType, myPlayerId),
    [card, zoneType, myPlayerId]
  );

  const style = React.useMemo<React.CSSProperties>(
    () =>
      computeCardContainerStyle({
        propStyle,
        scale,
        tapped: card.tapped,
        isDragging,
      }),
    [propStyle, scale, card.tapped, isDragging]
  );

  const imageTransform = React.useMemo(() => {
    const flipRotation = getFlipRotation(card);
    return flipRotation ? `rotate(${flipRotation}deg)` : undefined;
  }, [card, card.scryfall?.layout, card.currentFaceIndex]);

  const hoverTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  const handleMouseEnter = React.useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const policy = getCardHoverPreviewPolicy({
        zoneType,
        canPeek,
        faceDown,
        isDragging,
      });
      if (policy.kind === "none") return;

      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = null;
      }

      const rect = e.currentTarget.getBoundingClientRect();
      if (policy.kind === "immediate") {
        showPreview(card, rect);
        return;
      }
      hoverTimeoutRef.current = setTimeout(() => {
        showPreview(card, rect);
        hoverTimeoutRef.current = null;
      }, policy.delayMs);
    },
    [isDragging, canPeek, card, faceDown, showPreview, zoneType]
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
      if (
        !canToggleCardPreviewLock({
          zoneType,
          canPeek,
          faceDown,
          isDragging,
        })
      ) {
        return;
      }

      const rect = e.currentTarget.getBoundingClientRect();
      toggleLock(card, rect);
    },
    [zoneType, isDragging, card, toggleLock, faceDown, canPeek]
  );

  const handleDoubleClick = React.useCallback(() => {
    if (zoneType !== ZONE.BATTLEFIELD) return;
    if (card.ownerId !== myPlayerId) return;
    tapCard(card.id, myPlayerId);
  }, [zoneType, card.id, card.ownerId, myPlayerId, tapCard]);

  React.useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
      hidePreview();
    };
  }, [hidePreview]);

  const disableHoverAnimation = shouldDisableHoverAnimation({
    zoneType,
    ownerId: card.ownerId,
    viewerId: myPlayerId,
  });

  return {
    ref: setNodeRef,
    draggableProps: {
      ...listeners,
      ...attributes,
    },
    cardViewProps: {
      card,
      style,
      className,
      onContextMenu,
      faceDown,
      isDragging,
      onDoubleClick: handleDoubleClick,
      onClick: handleClick,
      onMouseEnter: handleMouseEnter,
      onMouseLeave: handleMouseLeave,
      imageTransform,
      preferArtCrop: useArtCrop,
      rotateLabel,
      highlightColor,
      disableHoverAnimation,
    },
  };
};
