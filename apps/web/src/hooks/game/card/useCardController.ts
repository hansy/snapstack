import React from "react";
import { useDraggable } from "@dnd-kit/core";

import { useGameStore } from "@/store/gameStore";
import { ZONE } from "@/constants/zones";

import { useCardPreview } from "@/components/game/card/CardPreviewProvider";
import {
  canViewerSeeCardIdentity,
  canViewerSeeLibraryCardByReveal,
  canViewerSeeLibraryTopCard,
} from "@/lib/reveal";
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

const PREVIEW_LOCK_LONG_PRESS_MS = 400;
const PREVIEW_LOCK_MOVE_TOLERANCE_PX = 8;

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
    Boolean(disableInteractions) ||
    Boolean(propIsDragging) ||
    internalIsDragging;
  const zone = useGameStore((state) => state.zones[card.zoneId]);
  const zoneType = zone?.type;
  const zoneOwnerId = zone?.ownerId;
  const zoneCardIds = zone?.cardIds ?? [];
  const myPlayerId = useGameStore((state) => state.myPlayerId);
  const viewerRole = useGameStore((state) => state.viewerRole);
  const tapCard = useGameStore((state) => state.tapCard);
  const useArtCrop = preferArtCrop ?? false;
  const isSelected = useSelectionStore(
    (state) =>
      state.selectionZoneId === card.zoneId &&
      state.selectedCardIds.includes(card.id)
  );
  const toggleCardSelection = useSelectionStore((state) => state.toggleCard);
  const selectOnly = useSelectionStore((state) => state.selectOnly);

  const isZoneTopCard =
    zoneCardIds.length > 0 && zoneCardIds[zoneCardIds.length - 1] === card.id;
  const libraryTopReveal = useGameStore(
    (state) => state.players[zoneOwnerId ?? card.ownerId]?.libraryTopReveal
  );
  const canSeeLibraryTop =
    zoneType === ZONE.LIBRARY &&
    isZoneTopCard &&
    (canViewerSeeLibraryCardByReveal(card, myPlayerId, viewerRole) ||
      canViewerSeeLibraryTopCard({
        viewerId: myPlayerId,
        ownerId: zoneOwnerId ?? card.ownerId,
        mode: libraryTopReveal,
      }));
  const canPeek = React.useMemo(
    () =>
      canViewerSeeCardIdentity(card, zoneType, myPlayerId, viewerRole) ||
      Boolean(canSeeLibraryTop),
    [card, zoneType, myPlayerId, viewerRole, canSeeLibraryTop]
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
  const hoverLeaveTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const lockPressTimeoutRef = React.useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const lockPressStartRef = React.useRef<{ x: number; y: number } | null>(null);

  const clearHoverLeaveTimeout = React.useCallback(() => {
    if (hoverLeaveTimeoutRef.current) {
      clearTimeout(hoverLeaveTimeoutRef.current);
      hoverLeaveTimeoutRef.current = null;
    }
  }, []);

  const clearLockPress = React.useCallback(() => {
    if (lockPressTimeoutRef.current) {
      clearTimeout(lockPressTimeoutRef.current);
      lockPressTimeoutRef.current = null;
    }
    lockPressStartRef.current = null;
  }, []);

  const handleMouseEnter = React.useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      clearHoverLeaveTimeout();
      if (interactionsDisabled) return;
      const policy = getCardHoverPreviewPolicy({
        zoneType,
        canPeek,
        faceDown,
        isDragging: interactionsDisabled,
        isZoneTopCard,
        allowLibraryTopPreview: canSeeLibraryTop,
      });
      if (policy.kind === "none") return;

      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = null;
      }

      const target = e.currentTarget;
      if (policy.kind === "immediate") {
        showPreview(card, target);
        return;
      }
      hoverTimeoutRef.current = setTimeout(() => {
        showPreview(card, target);
        hoverTimeoutRef.current = null;
      }, policy.delayMs);
    },
    [
      clearHoverLeaveTimeout,
      interactionsDisabled,
      canPeek,
      card,
      faceDown,
      showPreview,
      zoneType,
      isZoneTopCard,
      canSeeLibraryTop,
    ]
  );

  const handleMouseLeave = React.useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const { clientX, clientY } = e;
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = null;
      }
      clearHoverLeaveTimeout();
      hoverLeaveTimeoutRef.current = setTimeout(() => {
        hoverLeaveTimeoutRef.current = null;
        if (typeof document !== "undefined") {
          const element = document.elementFromPoint(clientX, clientY);
          if (
            element instanceof Element &&
            element.closest(`[data-card-id="${card.id}"]`)
          ) {
            return;
          }
        }
        hidePreview();
      }, 50);
    },
    [clearHoverLeaveTimeout, hidePreview, card.id]
  );

  const handleLockPressStart = React.useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (interactionsDisabled) return;
      if (e.button !== 0) return;
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

      const target = e.currentTarget;
      lockPressStartRef.current = { x: e.clientX, y: e.clientY };
      if (lockPressTimeoutRef.current) {
        clearTimeout(lockPressTimeoutRef.current);
      }
      lockPressTimeoutRef.current = setTimeout(() => {
        lockPressTimeoutRef.current = null;
        lockPressStartRef.current = null;
        toggleLock(card, target);
      }, PREVIEW_LOCK_LONG_PRESS_MS);
    },
    [zoneType, interactionsDisabled, card, toggleLock, faceDown, canPeek]
  );

  const handleLockPressMove = React.useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!lockPressTimeoutRef.current || !lockPressStartRef.current) return;
      const dx = e.clientX - lockPressStartRef.current.x;
      const dy = e.clientY - lockPressStartRef.current.y;
      if (Math.hypot(dx, dy) > PREVIEW_LOCK_MOVE_TOLERANCE_PX) {
        clearLockPress();
      }
    },
    [clearLockPress]
  );

  const handleLockPressEnd = React.useCallback(() => {
    clearLockPress();
  }, [clearLockPress]);

  const handleDoubleClick = React.useCallback(() => {
    if (viewerRole === "spectator") return;
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
    viewerRole,
  ]);

  const handlePointerDown = React.useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (viewerRole === "spectator") return;
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
      viewerRole,
    ]
  );

  React.useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
      clearHoverLeaveTimeout();
      clearLockPress();
      hidePreview();
    };
  }, [hidePreview, clearLockPress, clearHoverLeaveTimeout]);

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
      onMouseEnter: handleMouseEnter,
      onMouseLeave: handleMouseLeave,
      onPointerMove: handleLockPressMove,
      onPointerUp: handleLockPressEnd,
      onPointerCancel: handleLockPressEnd,
      onPointerLeave: handleLockPressEnd,
      imageTransform,
      preferArtCrop: useArtCrop,
      rotateLabel,
      highlightColor,
      isSelected: propIsSelected,
      disableHoverAnimation,
      showCommanderBadge: card.isCommander && zoneType === ZONE.BATTLEFIELD,
    },
    draggableProps: {
      ...listeners,
      ...attributes,
      onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => {
        handlePointerDown(event);
        handleLockPressStart(event);
        listeners?.onPointerDown?.(event);
      },
    },
  };
};
