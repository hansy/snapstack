import React from "react";
import { cn } from "@/lib/utils";
import { Zone as ZoneType, Card as CardType } from "@/types";
import { Card } from "../card/Card";
import { Zone } from "../zone/Zone";
import { ZONE_LABEL } from "@/constants/zones";
import { shouldRenderFaceDown } from "@/lib/reveal";
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
  viewerPlayerId: string;
  onCardContextMenu?: (e: React.MouseEvent, card: CardType) => void;
  className?: string;
  scale?: number;
}

const SortableCard = React.memo(({
  card,
  isTop,
  isMe,
  viewerPlayerId,
  onCardContextMenu,
}: {
  card: CardType;
  isTop: boolean;
  isMe: boolean;
  viewerPlayerId: string;
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

  const style = React.useMemo(() => ({
    transform: CSS.Transform.toString(transform),
    transition,
  }), [transform, transition]);

  const handleContextMenu = React.useCallback((e: React.MouseEvent) => {
    onCardContextMenu?.(e, card);
  }, [onCardContextMenu, card]);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "relative shrink-0 h-full w-auto max-w-12 transition-all duration-200 ease-out group",
        "hover:max-w-[20rem] hover:z-50 hover:scale-110",
        isDragging && "z-50 opacity-0"
      )}
      {...attributes}
      {...listeners}
    >
      <div
        className={cn(
          "w-auto aspect-[11/15] transition-transform duration-200",
          isTop
            ? "-translate-y-[35%] group-hover:translate-y-0"
            : "translate-y-[35%] group-hover:translate-y-0"
        )}
      >
        <Card
          card={card}
          className="shadow-xl ring-1 ring-black/50"
          faceDown={shouldRenderFaceDown(card, "hand", viewerPlayerId)}
          onContextMenu={handleContextMenu}
          disableDrag // We use Sortable's drag handle
          isDragging={isDragging}
          scale={1.5}
        />
      </div>
    </div>
  );
});

const HandInner: React.FC<HandProps> = ({
  zone,
  cards,
  isTop,
  isRight,
  isMe,
  viewerPlayerId,
  onCardContextMenu,
  className,
  scale = 1,
}) => {
  // Memoize card IDs array for SortableContext
  const cardIds = React.useMemo(() => cards.map((c) => c.id), [cards]);

  return (
    <div
      className={cn(
        "h-full flex-1 relative z-20 min-w-0 w-0", // w-0 enforces flex width constraint
        // Distinct background for hand area
        "bg-zinc-900/60 backdrop-blur-sm",
        isTop ? "border-b border-white/10" : "border-t border-white/10",
        // Padding to prevent bleeding into adjacent seats
        "px-4",
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
          "w-full h-full flex overflow-x-auto overflow-y-hidden scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent overscroll-x-none"
        )}
      >
        <SortableContext
          items={cardIds}
          strategy={horizontalListSortingStrategy}
        >
          <div
            className={cn(
              "flex m-auto gap-0", // m-auto safely centers content
              isTop ? "items-start pt-4" : "items-end pb-4"
            )}
          >
            {cards.map((card) => (
              <SortableCard
                key={card.id}
                card={card}
                isTop={isTop}
                isMe={isMe}
                viewerPlayerId={viewerPlayerId}
                onCardContextMenu={onCardContextMenu}
              />
            ))}
          </div>
        </SortableContext>
      </Zone>
    </div>
  );
};

export const Hand = React.memo(HandInner);
