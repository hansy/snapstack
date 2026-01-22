import React from "react";
import { Card as CardType } from "@/types";
import { useGameStore } from "@/store/gameStore";

import { getNextCardStatUpdate } from "@/lib/cardPT";
import { isTransformableCard } from "@/lib/cardDisplay";
import { cn } from "@/lib/utils";

import { CardFaceView } from "./CardFaceView";
import { createCardFaceModel } from "@/models/game/card/cardFaceModel";

interface CardFaceProps {
  card: CardType;
  faceDown?: boolean;
  imageClassName?: string;
  imageTransform?: string;
  countersClassName?: string;
  interactive?: boolean;
  hidePT?: boolean;
  showCounterLabels?: boolean;
  preferArtCrop?: boolean;
  showNameLabel?: boolean;
  rotateLabel?: boolean;
  customTextNode?: React.ReactNode;
  customTextPosition?: "sidebar" | "bottom-left" | "center";
  hideRevealIcon?: boolean;
}

const CardFaceInner: React.FC<CardFaceProps> = ({
  card,
  faceDown,
  imageClassName,
  imageTransform,
  countersClassName,
  interactive,
  hidePT,
  showCounterLabels,
  preferArtCrop = false,
  showNameLabel = true,
  rotateLabel = false,
  customTextNode,
  customTextPosition,
  hideRevealIcon,
}) => {
  const addCounterToCard = useGameStore((state) => state.addCounterToCard);
  const removeCounterFromCard = useGameStore(
    (state) => state.removeCounterFromCard
  );
  const updateCard = useGameStore((state) => state.updateCard);
  const globalCounters = useGameStore((state) => state.globalCounters);
  const myPlayerId = useGameStore((state) => state.myPlayerId);
  const players = useGameStore((state) => state.players);
  const zoneType = useGameStore((state) => state.zones[card.zoneId]?.type);

  const faceCount = card.scryfall?.card_faces?.length ?? 0;
  const isFlipLayout = card.scryfall?.layout === "flip";
  const useTransformFlip =
    !faceDown &&
    faceCount === 2 &&
    isTransformableCard(card) &&
    !isFlipLayout;

  const frontCard = React.useMemo(
    () =>
      useTransformFlip ? { ...card, currentFaceIndex: 0 } : card,
    [card, useTransformFlip]
  );
  const frontFaceDown = useTransformFlip ? false : Boolean(faceDown);

  const revealToNames = React.useMemo(() => {
    const ids = card.revealedTo || [];
    if (!ids.length) return [];
    return ids.map((id) => players[id]?.name || id);
  }, [card.revealedTo, players]);

  const frontModel = React.useMemo(
    () =>
      createCardFaceModel({
        card: frontCard,
        zoneType,
        faceDown: frontFaceDown,
        preferArtCrop,
        hidePT,
        showNameLabel,
        hideRevealIcon,
        myPlayerId,
        globalCounters,
        revealToNames,
      }),
    [
      frontCard,
      frontFaceDown,
      globalCounters,
      hidePT,
      hideRevealIcon,
      myPlayerId,
      preferArtCrop,
      revealToNames,
      showNameLabel,
      zoneType,
    ]
  );

  const backCard = React.useMemo(
    () => (useTransformFlip ? { ...card, currentFaceIndex: 1 } : card),
    [card, useTransformFlip]
  );
  const backFaceDown = false;
  const backModel = React.useMemo(
    () =>
      createCardFaceModel({
        card: backCard,
        zoneType,
        faceDown: backFaceDown,
        preferArtCrop,
        hidePT,
        showNameLabel,
        hideRevealIcon,
        myPlayerId,
        globalCounters,
        revealToNames,
      }),
    [
      backCard,
      backFaceDown,
      globalCounters,
      hidePT,
      hideRevealIcon,
      myPlayerId,
      preferArtCrop,
      revealToNames,
      showNameLabel,
      zoneType,
    ]
  );

  const handlePTDelta = React.useCallback(
    (type: "power" | "toughness", delta: number) => {
      const update = getNextCardStatUpdate(card, type, delta);
      if (!update) return;
      updateCard(card.id, update);
    },
    [card, updateCard]
  );

  const handleIncrementCounter = React.useCallback(
    (counter: { type: string; color?: string }) => {
      addCounterToCard(card.id, { ...counter, count: 1 });
    },
    [addCounterToCard, card.id]
  );

  const handleDecrementCounter = React.useCallback(
    (counterType: string) => {
      removeCounterFromCard(card.id, counterType);
    },
    [removeCounterFromCard, card.id]
  );

  const isFlipped = (card.currentFaceIndex ?? 0) === 1;
  if (!useTransformFlip) {
    return (
      <CardFaceView
        faceDown={frontFaceDown}
        model={frontModel}
        imageClassName={imageClassName}
        imageTransform={imageTransform}
        countersClassName={countersClassName}
        interactive={interactive}
        showCounterLabels={showCounterLabels}
        rotateLabel={rotateLabel}
        customTextNode={customTextNode}
        customTextPosition={customTextPosition}
        onPTDelta={handlePTDelta}
        onIncrementCounter={handleIncrementCounter}
        onDecrementCounter={handleDecrementCounter}
      />
    );
  }

  return (
    <div className="relative h-full w-full [perspective:1200px]">
      <div
        className={cn(
          "relative h-full w-full transition-transform duration-300 ease-out [transform-style:preserve-3d]",
          isFlipped && "[transform:rotateY(180deg)]"
        )}
      >
        <div
          className={cn(
            "absolute inset-0 [backface-visibility:hidden]",
            isFlipped ? "pointer-events-none" : "pointer-events-auto"
          )}
        >
          <CardFaceView
            faceDown={frontFaceDown}
            model={frontModel}
            imageClassName={imageClassName}
            imageTransform={imageTransform}
            countersClassName={countersClassName}
            interactive={interactive}
            showCounterLabels={showCounterLabels}
            rotateLabel={rotateLabel}
            customTextNode={customTextNode}
            customTextPosition={customTextPosition}
            onPTDelta={handlePTDelta}
            onIncrementCounter={handleIncrementCounter}
            onDecrementCounter={handleDecrementCounter}
          />
        </div>
        <div
          className={cn(
            "absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]",
            isFlipped ? "pointer-events-auto" : "pointer-events-none"
          )}
        >
          <CardFaceView
            faceDown={backFaceDown}
            model={backModel}
            imageClassName={imageClassName}
            imageTransform={imageTransform}
            countersClassName={countersClassName}
            interactive={interactive}
            showCounterLabels={showCounterLabels}
            rotateLabel={rotateLabel}
            customTextNode={customTextNode}
            customTextPosition={customTextPosition}
            onPTDelta={handlePTDelta}
            onIncrementCounter={handleIncrementCounter}
            onDecrementCounter={handleDecrementCounter}
          />
        </div>
      </div>
    </div>
  );
};

export const CardFace = React.memo(CardFaceInner);
