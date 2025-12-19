import React from "react";

import type { CardFaceCounterModel, CardFaceModel } from "@/models/game/card/cardFaceModel";
import type { CardStatKey } from "@/lib/cardPT";

import { CardFaceArtwork } from "./CardFaceArtwork";
import { CardFaceCountersOverlay } from "./CardFaceCountersOverlay";
import { CardFaceCustomTextOverlay } from "./CardFaceCustomTextOverlay";
import { CardFaceNameLabel } from "./CardFaceNameLabel";
import { CardFacePTBadge } from "./CardFacePTBadge";
import { CardFaceRevealBadge } from "./CardFaceRevealBadge";

interface CardFaceViewProps {
  faceDown?: boolean;
  model: CardFaceModel;
  imageClassName?: string;
  imageTransform?: string;
  countersClassName?: string;
  interactive?: boolean;
  showCounterLabels?: boolean;
  rotateLabel?: boolean;
  customTextNode?: React.ReactNode;
  customTextPosition?: "sidebar" | "bottom-left" | "center";
  onPTDelta?: (type: CardStatKey, delta: number) => void;
  onIncrementCounter?: (
    counter: Pick<CardFaceCounterModel, "type" | "color">
  ) => void;
  onDecrementCounter?: (counterType: string) => void;
}

export const CardFaceView: React.FC<CardFaceViewProps> = ({
  faceDown,
  model,
  imageClassName,
  imageTransform,
  countersClassName,
  interactive,
  showCounterLabels,
  rotateLabel,
  customTextNode,
  customTextPosition,
  onPTDelta,
  onIncrementCounter,
  onDecrementCounter,
}) => {
  return (
    <>
      <CardFaceArtwork
        faceDown={faceDown}
        displayImageUrl={model.displayImageUrl}
        displayName={model.displayName}
        imageClassName={imageClassName}
        imageTransform={imageTransform}
      />

      <CardFacePTBadge
        showPT={model.showPT}
        interactive={interactive}
        displayPower={model.displayPower}
        displayToughness={model.displayToughness}
        powerClassName={model.powerClassName}
        toughnessClassName={model.toughnessClassName}
        onPTDelta={onPTDelta}
      />

      <CardFaceNameLabel
        showNameLabel={model.showNameLabel}
        displayName={model.displayName}
        rotateLabel={rotateLabel}
      />

      <CardFaceCountersOverlay
        counters={model.counters}
        countersClassName={countersClassName}
        interactive={interactive}
        showCounterLabels={showCounterLabels}
        onIncrementCounter={onIncrementCounter}
        onDecrementCounter={onDecrementCounter}
        customTextNode={customTextNode}
        customTextPosition={customTextPosition}
      />

      <CardFaceCustomTextOverlay
        customTextNode={customTextNode}
        customTextPosition={customTextPosition}
      />

      <CardFaceRevealBadge reveal={model.reveal} />
    </>
  );
};
