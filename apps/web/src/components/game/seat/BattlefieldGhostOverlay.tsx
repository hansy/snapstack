import * as React from "react";

import type { Card } from "@/types";
import { getCardPixelSize } from "@/lib/positions";
import { getFlipRotation } from "@/lib/cardDisplay";
import { CardView } from "../card/CardView";

type GhostCardView = {
  card: Card;
  position: { x: number; y: number };
  tapped: boolean;
};

type BattlefieldGhostOverlayProps = {
  ghostCards: GhostCardView[];
  viewScale: number;
  baseCardHeight?: number;
  baseCardWidth?: number;
  zoneOwnerId: string;
  playerColors: Record<string, string>;
  selectedCardIds: string[];
};

export const BattlefieldGhostOverlay = React.memo(
  ({
    ghostCards,
    viewScale,
    baseCardHeight,
    baseCardWidth,
    zoneOwnerId,
    playerColors,
    selectedCardIds,
  }: BattlefieldGhostOverlayProps) => {
    if (ghostCards.length === 0) return null;
    const { cardWidth: baseWidth, cardHeight: baseHeight } = getCardPixelSize({
      viewScale: 1,
      isTapped: false,
      baseCardHeight,
      baseCardWidth,
    });

    return (
      <>
        {ghostCards.map(({ card, position, tapped }) => {
          const rotation = card.rotation ? ` rotate(${card.rotation}deg)` : "";
          const tappedRotation = tapped ? " rotate(90deg)" : "";
          const transform = `scale(${viewScale})${rotation}${tappedRotation}`;
          const highlightColor =
            card.ownerId !== zoneOwnerId ? playerColors[card.ownerId] : undefined;
          const flipRotation = getFlipRotation(card);

          return (
            <CardView
              key={`ghost-${card.id}`}
              card={card}
              style={{
                position: "absolute",
                left: position.x - baseWidth / 2,
                top: position.y - baseHeight / 2,
                transform,
                transformOrigin: "center center",
              }}
              className="pointer-events-none opacity-80 z-10"
              faceDown={card.faceDown}
              imageTransform={
                flipRotation ? `rotate(${flipRotation}deg)` : undefined
              }
              highlightColor={highlightColor}
              isSelected={selectedCardIds.includes(card.id)}
              disableHoverAnimation
            />
          );
        })}
      </>
    );
  }
);

BattlefieldGhostOverlay.displayName = "BattlefieldGhostOverlay";
