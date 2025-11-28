import React from "react";
import { cn } from "../../../lib/utils";
import { Zone as ZoneType, Card as CardType } from "../../../types";
import { Card } from "../Card/Card";
import { Zone } from "../Zone/Zone";
import { CARD_HEIGHT, CARD_ASPECT_RATIO } from "../../../lib/constants";
import { ZONE_LABEL } from "@/constants/zones";

interface HandProps {
  zone: ZoneType;
  cards: CardType[];
  isTop: boolean;
  isRight: boolean;
  isMe: boolean;
  onCardContextMenu?: (e: React.MouseEvent, card: CardType) => void;
  className?: string;
  scale?: number;
}

export const Hand: React.FC<HandProps> = ({
  zone,
  cards,
  isTop,
  isRight,
  isMe,
  onCardContextMenu,
  className,
  scale = 1,
}) => {
  return (
    <div
      className={cn(
        "h-full flex-1 relative z-20",
        // Distinct background for hand area
        "bg-zinc-900/60 backdrop-blur-sm",
        isTop ? "border-b border-white/10" : "border-t border-white/10",
        className
      )}
    >
      {/* Hand Label */}
      <div
        className={cn(
          "absolute px-3 py-1 text-md font-bold uppercase tracking-widest text-zinc-400 bg-zinc-900/80 border border-zinc-700/50 rounded-full z-30 pointer-events-none select-none",
          // Vertical positioning: straddle the border
          isTop ? "-bottom-3" : "-top-3",
          // Horizontal positioning: opposite to sidebar
          // If sidebar is Right (isRight), label is Left
          // If sidebar is Left (!isRight), label is Right
          isRight ? "left-8" : "right-8"
        )}
      >
        {ZONE_LABEL.hand} - {cards.length}
      </div>

      <Zone
        zone={zone}
        scale={scale}
        className={cn(
          "w-full h-full flex justify-center overflow-visible",
          isTop ? "items-start" : "items-end"
        )}
      >
        {cards.map((card, index, array) => {
          const totalCards = array.length;
          const centerIndex = (totalCards - 1) / 2;
          const rotate = (index - centerIndex) * 3;
          const translateY = Math.abs(index - centerIndex) * 2;
          const fanTransform = isTop
            ? `translateY(-20%) rotate(${180 - rotate}deg) translateY(${translateY}px)`
            : `translateY(20%) rotate(${rotate}deg) translateY(${translateY}px)`;

          return (
            <div
              key={card.id}
              className={cn(
                "relative shrink-0 -ml-6 first:ml-0 z-0 hover:z-50 hover:scale-110 group",
                CARD_HEIGHT,
                CARD_ASPECT_RATIO
              )}
            >
              <div
                className={cn(
                  "w-full h-full",
                  isTop
                    ? "group-hover:translate-y-[60%]"
                    : "group-hover:-translate-y-[10%]"
                )}
              >
                <Card
                  card={card}
                  style={{
                    transform: fanTransform,
                  }}
                  className="shadow-xl ring-1 ring-black/50"
                  faceDown={!isMe}
                  onContextMenu={(e) => onCardContextMenu?.(e, card)}
                />
              </div>
            </div>
          );
        })}
      </Zone>
    </div>
  );
};
