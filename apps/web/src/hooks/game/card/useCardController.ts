import React from "react";
import { useDraggable } from "@dnd-kit/core";

import { useGameStore } from "@/store/gameStore";
import { ZONE } from "@/constants/zones";

import { useCardPreview } from "@/components/game/card/CardPreviewProvider";
import { canViewerSeeCardIdentity } from "@/lib/reveal";
import { getFlipRotation } from "@/lib/cardDisplay";
import { useSelectionStore } from "@/store/selectionStore";
import {
  canToggleCardPreviewLock,
  computeCardContainerStyle,
  getCardHoverPreviewPolicy,
  shouldDisableHoverAnimation,
} from "@/models/game/card/cardModel";
import { batchSharedMutations } from "@/yjs/docManager";
import { resolveSelectedCardIds } from "@/models/game/selection/selectionModel";

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
    disableInteractions,
    highlightColor,
    isSelected: propIsSelected,
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
  const interactionsDisabled =
    Boolean(disableInteractions) || Boolean(propIsDragging) || internalIsDragging;
  const zoneType = useGameStore((state) => state.zones[card.zoneId]?.type);
  const zoneOwnerId = useGameStore((state) => state.zones[card.zoneId]?.ownerId);
  const myPlayerId = useGameStore((state) => state.myPlayerId);
  const tapCard = useGameStore((state) => state.tapCard);
  const useArtCrop = preferArtCrop ?? false;
  const isSelected = useSelectionStore(
    (state) =>
      state.selectionZoneId === card.zoneId &&
      state.selectedCardIds.includes(card.id)
  );
  const toggleCardSelection = useSelectionStore((state) => state.toggleCard);
  const selectOnly = useSelectionStore((state) => state.selectOnly);

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
      if (interactionsDisabled) return;
      const policy = getCardHoverPreviewPolicy({
        zoneType,
        canPeek,
        faceDown,
        isDragging: interactionsDisabled,
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
    [interactionsDisabled, canPeek, card, faceDown, showPreview, zoneType]
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
      if (interactionsDisabled) return;
      if (
        e.defaultPrevented ||
        e.shiftKey ||
        e.metaKey ||
        e.ctrlKey ||
        e.altKey
      ) {
        return;
      }
      if (
        !canToggleCardPreviewLock({
          zoneType,
          canPeek,
          faceDown,
          isDragging: interactionsDisabled,
        })
      ) {
        return;
      }

      const rect = e.currentTarget.getBoundingClientRect();
      toggleLock(card, rect);
    },
    [zoneType, interactionsDisabled, card, toggleLock, faceDown, canPeek]
  );

  const handleDoubleClick = React.useCallback(() => {
    if (interactionsDisabled) return;
    if (zoneType !== ZONE.BATTLEFIELD) return;
    const actorId = myPlayerId;
    const selection = useSelectionStore.getState();
    const state = useGameStore.getState();
    const groupIds = resolveSelectedCardIds({
      seedCardId: card.id,
      cardsById: state.cards,
      selection,
      minCount: 2,
      fallbackToSeed: true,
    });
    if (groupIds.length > 1) {
      const targetTapped = !card.tapped;
      batchSharedMutations(() => {
        groupIds.forEach((id) => {
          const targetCard = state.cards[id];
          if (!targetCard) return;
          if (targetCard.zoneId !== card.zoneId) return;
          if (targetCard.controllerId !== actorId) return;
          if (targetCard.tapped === targetTapped) return;
          tapCard(targetCard.id, actorId);
        });
      });
      return;
    }
    if (card.controllerId !== actorId) return;
    tapCard(card.id, actorId);
  }, [
    interactionsDisabled,
    zoneType,
    card.id,
    card.zoneId,
    card.controllerId,
    card.tapped,
    myPlayerId,
    tapCard,
  ]);

  const handlePointerDown = React.useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (interactionsDisabled) return;
      if (e.button !== 0) return;
      if (zoneType !== ZONE.BATTLEFIELD) return;
      if (zoneOwnerId !== myPlayerId) return;

      if (e.shiftKey) {
        toggleCardSelection(card.id, card.zoneId);
        return;
      }

      if (!isSelected) {
        selectOnly(card.id, card.zoneId);
      }
    },
    [
      card.id,
      card.zoneId,
      isSelected,
      myPlayerId,
      selectOnly,
      toggleCardSelection,
      zoneOwnerId,
      zoneType,
      interactionsDisabled,
    ]
  );

  React.useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
      hidePreview();
    };
  }, [hidePreview]);

  const disableHoverAnimation =
    shouldDisableHoverAnimation({
      zoneType,
      ownerId: card.ownerId,
      viewerId: myPlayerId,
    }) || interactionsDisabled;

  return {
    ref: setNodeRef,
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
      isSelected: propIsSelected,
      disableHoverAnimation,
    },
    draggableProps: {
      ...listeners,
      ...attributes,
      onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => {
        handlePointerDown(event);
        listeners?.onPointerDown?.(event);
      },
    },
  };
};
