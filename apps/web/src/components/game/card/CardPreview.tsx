import React, { useEffect, useState } from "react";
import { Card as CardType } from "@/types";

import { cn } from "@/lib/utils";
import { ZONE } from "@/constants/zones";
import { useGameStore } from "@/store/gameStore";
import { getNextCardStatUpdate } from "@/lib/cardPT";
import { computeCardPreviewPosition } from "@/lib/cardPreviewPosition";
import {
  getDisplayPower,
  getDisplayToughness,
  getFlipRotation,
  shouldShowPowerToughness,
} from "@/lib/cardDisplay";
import { CardPreviewView } from "./CardPreviewView";

interface CardPreviewProps {
  card: CardType;
  anchorRect: DOMRect;
  width?: number;
  locked?: boolean;
  onClose?: () => void;
}

const PREVIEW_WIDTH = 200; // Reduced size
const GAP = 18;

export const CardPreview: React.FC<CardPreviewProps> = ({
  card,
  anchorRect,
  width = PREVIEW_WIDTH,
  locked,
  onClose,
}) => {
  const [style, setStyle] = useState<{
    top: number;
    left: number;
    opacity: number;
  }>({ top: 0, left: 0, opacity: 0 });
  const [isPositioned, setIsPositioned] = useState(false);
  const updateCard = useGameStore((state) => state.updateCard);
  const myPlayerId = useGameStore((state) => state.myPlayerId);
  const players = useGameStore((state) => state.players);

  // Subscribe to the live card data to ensure we have the latest P/T and counters
  const liveCard = useGameStore((state) => state.cards[card.id]);

  // Use liveCard if available, otherwise fallback to the prop (snapshot)
  const currentCard = liveCard || card;
  const showPT = shouldShowPowerToughness(currentCard);
  const displayPower = getDisplayPower(currentCard);
  const displayToughness = getDisplayToughness(currentCard);
  const flipRotation = getFlipRotation(currentCard);
  const zoneType = useGameStore((state) => state.zones[currentCard.zoneId]?.type);

  // Local face override for previewing DFCs
  const [overrideFaceIndex, setOverrideFaceIndex] = useState<number | null>(null);

  useEffect(() => {
    // Reset override if the card ID changes (new card shown)
    setOverrideFaceIndex(null);
  }, [card.id]);

  useEffect(() => {
    const calculatedHeight = width * 1.4;
    const { top, left } = computeCardPreviewPosition({
      anchorRect,
      previewWidth: width,
      previewHeight: calculatedHeight,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      gapPx: GAP,
    });
    setStyle({ top, left, opacity: 1 });
    setIsPositioned(true);

    // Optional: Re-calculate on scroll/resize
    // window.addEventListener('resize', calculatePosition);
    // window.addEventListener('scroll', calculatePosition);
    // return () => { ... }
  }, [anchorRect, width]);

  const handleUpdatePT = (type: "power" | "toughness", delta: number) => {
    const update = getNextCardStatUpdate(currentCard, type, delta);
    if (!update) return;
    updateCard(currentCard.id, update);
  };

  // Don't render until positioned to avoid jump
  if (!isPositioned) return null;

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
      width={width}
      top={style.top}
      left={style.left}
      opacity={style.opacity}
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
