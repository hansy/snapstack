import React, { useEffect, useState } from "react";
import {
  autoUpdate,
  flip,
  offset,
  shift,
  useFloating,
  type Placement,
} from "@floating-ui/react";
import { Card as CardType } from "@/types";

import { cn } from "@/lib/utils";
import { ZONE } from "@/constants/zones";
import { useGameStore } from "@/store/gameStore";
import { getNextCardStatUpdate } from "@/lib/cardPT";
import {
  getDisplayPower,
  getDisplayToughness,
  getFlipRotation,
  getMorphDisplayStat,
  isMorphFaceDown,
  FACE_DOWN_MORPH_STAT,
  shouldShowPowerToughness,
} from "@/lib/cardDisplay";
import { CardPreviewView } from "./CardPreviewView";

interface CardPreviewProps {
  card: CardType;
  anchorEl: HTMLElement;
  width?: number;
  locked?: boolean;
  onClose?: () => void;
}

const PREVIEW_WIDTH = 200; // Reduced size
const GAP = 18;

export const CardPreview: React.FC<CardPreviewProps> = ({
  card,
  anchorEl,
  width = PREVIEW_WIDTH,
  locked,
  onClose,
}) => {
  const updateCard = useGameStore((state) => state.updateCard);
  const myPlayerId = useGameStore((state) => state.myPlayerId);
  const players = useGameStore((state) => state.players);

  // Subscribe to the live card data to ensure we have the latest P/T and counters
  const liveCard = useGameStore((state) => state.cards[card.id]);

  // Use liveCard if available, otherwise fallback to the prop (snapshot)
  const currentCard = liveCard || card;
  const zoneType = useGameStore((state) => state.zones[currentCard.zoneId]?.type);
  const faceDownOnBattlefield = zoneType === ZONE.BATTLEFIELD && currentCard.faceDown;
  const morphFaceDown = isMorphFaceDown(currentCard, faceDownOnBattlefield);
  const showPT = faceDownOnBattlefield
    ? morphFaceDown
    : shouldShowPowerToughness(currentCard);
  const displayPower = faceDownOnBattlefield
    ? morphFaceDown
      ? getMorphDisplayStat(currentCard, "power")
      : undefined
    : getDisplayPower(currentCard);
  const displayToughness = faceDownOnBattlefield
    ? morphFaceDown
      ? getMorphDisplayStat(currentCard, "toughness")
      : undefined
    : getDisplayToughness(currentCard);
  const ptBasePower = faceDownOnBattlefield && morphFaceDown ? FACE_DOWN_MORPH_STAT : currentCard.basePower;
  const ptBaseToughness =
    faceDownOnBattlefield && morphFaceDown ? FACE_DOWN_MORPH_STAT : currentCard.baseToughness;
  const flipRotation = getFlipRotation(currentCard);

  // Local face override for previewing DFCs
  const [overrideFaceIndex, setOverrideFaceIndex] = useState<number | null>(null);

  const fallbackPlacements: Placement[] = ["bottom", "left", "right"];
  const { refs, floatingStyles, update, x, y } = useFloating({
    placement: "top",
    strategy: "fixed",
    middleware: [
      offset(GAP),
      flip({ fallbackPlacements, padding: GAP }),
      shift({ padding: GAP }),
    ],
    whileElementsMounted: autoUpdate,
  });

  const resolveAnchor = React.useCallback(() => {
    const resolvedAnchor =
      anchorEl && anchorEl.isConnected
        ? anchorEl
        : (document.querySelector(`[data-card-id="${card.id}"]`) as HTMLElement | null);
    refs.setReference(resolvedAnchor);
    return resolvedAnchor;
  }, [anchorEl, card.id, refs]);

  useEffect(() => {
    // Reset override if the card ID changes (new card shown)
    setOverrideFaceIndex(null);
  }, [card.id]);

  useEffect(() => {
    const resolvedAnchor = resolveAnchor();
    if (resolvedAnchor) update();
  }, [
    update,
    resolveAnchor,
    currentCard.zoneId,
    currentCard.position?.x,
    currentCard.position?.y,
  ]);

  useEffect(() => {
    if (!locked || !onClose) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest("[data-card-preview]")) return;
      onClose();
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [locked, onClose]);

  const handleUpdatePT = (type: "power" | "toughness", delta: number) => {
    const update = getNextCardStatUpdate(currentCard, type, delta);
    if (!update) return;
    updateCard(currentCard.id, update);
  };

  const isPositioned = x != null && y != null;
  const previewStyle: React.CSSProperties = {
    ...floatingStyles,
    width,
    opacity: isPositioned ? 1 : 0,
    visibility: isPositioned ? "visible" : "hidden",
  };

  const effectiveFaceIndex = overrideFaceIndex ?? currentCard.currentFaceIndex ?? 0;

  // Construct the card to show (forcing the face index)
  const previewCard = { ...currentCard, currentFaceIndex: effectiveFaceIndex };

  const hasMultipleFaces = (currentCard.scryfall?.card_faces?.length ?? 0) > 1;

  const handleFlip = (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextIndex = effectiveFaceIndex === 0 ? 1 : 0;
    setOverrideFaceIndex(nextIndex);
  };

  const isController = currentCard.controllerId === myPlayerId;
  const isHand = zoneType === ZONE.HAND;

  // If in hand, we hide ancillary things
  const showAncillary = !isHand;

  const showControllerRevealIcon = Boolean(
    locked &&
      onClose &&
      (currentCard.revealedToAll ||
        (currentCard.revealedTo && currentCard.revealedTo.length > 0)) &&
      currentCard.controllerId === myPlayerId
  );

  const controllerRevealNames = showControllerRevealIcon
    ? currentCard.revealedToAll
      ? []
      : (currentCard.revealedTo || []).map((id) => players[id]?.name || id)
    : [];

  const customTextNode =
    showAncillary && currentCard.customText ? (
      <div
        className={cn(
          "bg-zinc-900/90 backdrop-blur-sm p-2 rounded-lg border border-zinc-700 shadow-xl min-w-[120px] max-w-[200px] mt-2",
          locked &&
            currentCard.controllerId === myPlayerId &&
            "cursor-text hover:border-indigo-500/50 transition-colors"
        )}
        onClick={(e) => {
          if (!locked || currentCard.controllerId !== myPlayerId) return;
          e.stopPropagation();
        }}
      >
        <CustomTextEditor card={currentCard} locked={locked} />
      </div>
    ) : null;

  return (
    <CardPreviewView
      currentCard={currentCard}
      previewCard={previewCard}
      locked={locked}
      onClose={onClose}
      style={previewStyle}
      ref={refs.setFloating}
      showControllerRevealIcon={showControllerRevealIcon}
      controllerRevealToAll={Boolean(currentCard.revealedToAll)}
      controllerRevealNames={controllerRevealNames}
      hasMultipleFaces={hasMultipleFaces}
      onFlip={handleFlip}
      flipRotation={flipRotation}
      showAncillary={showAncillary}
      isController={isController}
      customTextNode={customTextNode}
      showPT={showPT}
      displayPower={displayPower}
      displayToughness={displayToughness}
      ptBasePower={ptBasePower}
      ptBaseToughness={ptBaseToughness}
      onPTDelta={handleUpdatePT}
    />
  );
};

const CustomTextEditor: React.FC<{ card: CardType; locked?: boolean }> = ({
  card,
  locked,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [text, setText] = useState(card.customText || "");
  const updateCard = useGameStore((state) => state.updateCard);
  const myPlayerId = useGameStore((state) => state.myPlayerId);
  const isController = card.controllerId === myPlayerId;

  useEffect(() => {
    setText(card.customText || "");
  }, [card.customText]);

  const handleSave = () => {
    if (text !== card.customText) {
      updateCard(card.id, { customText: text });
    }
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <textarea
        autoFocus
        className="w-full bg-transparent text-zinc-100 text-sm resize-none outline-none min-h-[60px]"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={handleSave}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSave();
          }
          if (e.key === "Escape") {
            setText(card.customText || "");
            setIsEditing(false);
          }
        }}
        onClick={(e) => e.stopPropagation()}
      />
    );
  }

  return (
    <div
      className="text-sm text-zinc-200 whitespace-pre-wrap break-words"
      onClick={(e) => {
        if (locked && isController) {
          e.stopPropagation();
          setIsEditing(true);
        }
      }}
    >
      {card.customText || (
        <span className="text-zinc-500 italic">Add text...</span>
      )}
    </div>
  );
};
