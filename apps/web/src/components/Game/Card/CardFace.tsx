import React from "react";
import { Card as CardType } from "@/types";
import { useGameStore } from "@/store/gameStore";

import { getNextCardStatUpdate } from "@/lib/cardPT";

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

  const revealToNames = React.useMemo(() => {
    const ids = card.revealedTo || [];
    if (!ids.length) return [];
    return ids.map((id) => players[id]?.name || id);
  }, [card.revealedTo, players]);

  const model = React.useMemo(
    () =>
      createCardFaceModel({
        card,
        zoneType,
        faceDown,
        preferArtCrop,
        hidePT,
        showNameLabel,
        hideRevealIcon,
        myPlayerId,
        globalCounters,
        revealToNames,
      }),
    [
      card,
      faceDown,
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

  return (
    <CardFaceView
      faceDown={faceDown}
      model={model}
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
};

export const CardFace = React.memo(CardFaceInner);
