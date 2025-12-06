import React from "react";
import { cn } from "../../../lib/utils";
import { Zone as ZoneType, Card as CardType } from "../../../types";
import { Card } from "../Card/Card";
import { Zone } from "../Zone/Zone";
import { CARD_HEIGHT } from "../../../lib/constants";
import { ZONE_LABEL } from "@/constants/zones";
import {
  SortableContext,
  useSortable,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

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

const SortableCard = ({
  card,
  isTop,
  isMe,
  onCardContextMenu,
}: {
  card: CardType;
  isTop: boolean;
  isMe: boolean;
  onCardContextMenu?: (e: React.MouseEvent, card: CardType) => void;
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: card.id,
    data: {
      cardId: card.id,
      zoneId: card.zoneId,
      ownerId: card.ownerId,
      tapped: card.tapped,
    },
    disabled: !isMe,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "relative shrink-0 w-12 transition-all duration-200 ease-out group",
        "hover:w-[94px] hover:z-50 hover:scale-110",
        isDragging && "z-50 opacity-0",
        CARD_HEIGHT
      )}
      {...attributes}
      {...listeners}
    >
      <div
        className={cn(
          "w-[94px] h-full transition-transform duration-200",
          isTop
            ? "-translate-y-[35%] group-hover:-translate-y-[10%]"
            : "translate-y-[35%] group-hover:translate-y-[10%]"
        )}
      >
        <Card
          card={card}
          className="shadow-xl ring-1 ring-black/50"
          faceDown={!isMe}
          onContextMenu={(e) => onCardContextMenu?.(e, card)}
          disableDrag // We use Sortable's drag handle
          isDragging={isDragging}
        />
      </div>
    </div>
  );
};

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
        "h-full flex-1 relative z-20 min-w-0 w-0", // w-0 enforces flex width constraint
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
          "w-full h-full flex overflow-x-auto overflow-y-hidden pl-4 pr-12 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent",
          isTop ? "items-start pt-4" : "items-end pb-4"
        )}
      >
        <SortableContext
          items={cards.map((c) => c.id)}
          strategy={horizontalListSortingStrategy}
        >
          {cards.map((card) => (
            <SortableCard
              key={card.id}
              card={card}
              isTop={isTop}
              isMe={isMe}
              onCardContextMenu={onCardContextMenu}
            />
          ))}
        </SortableContext>
      </Zone>
    </div>
  );
};
