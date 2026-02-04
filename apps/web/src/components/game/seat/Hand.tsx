import React from "react";
import { cn } from "@/lib/utils";
import { Zone as ZoneType, Card as CardType, ViewerRole } from "@/types";
import { Card } from "../card/Card";
import { Zone } from "../zone/Zone";
import { ZONE_LABEL } from "@/constants/zones";
import { shouldRenderFaceDown } from "@/lib/reveal";
import { BASE_CARD_HEIGHT, CARD_ASPECT_RATIO } from "@/lib/constants";
import { HAND_CARD_OVERLAP_RATIO } from "./handSizing";
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
  viewerRole?: ViewerRole;
  onCardContextMenu?: (e: React.MouseEvent, card: CardType) => void;
  className?: string;
  scale?: number;
  cardScale?: number;
  baseCardHeight?: number;
}

const SortableCard = React.memo(({
  card,
  isTop,
  isMe,
  viewerPlayerId,
  viewerRole,
  onCardContextMenu,
  cardScale,
  baseCardHeight,
}: {
  card: CardType;
  isTop: boolean;
  isMe: boolean;
  viewerPlayerId: string;
  viewerRole?: ViewerRole;
  onCardContextMenu?: (e: React.MouseEvent, card: CardType) => void;
  cardScale: number;
  baseCardHeight?: number;
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
      cardScale,
    },
    disabled: !isMe,
  });

  const style = React.useMemo(() => {
    const resolvedBaseHeight = baseCardHeight ?? BASE_CARD_HEIGHT;
    const cardWidth = resolvedBaseHeight * CARD_ASPECT_RATIO * cardScale;
    const overlapWidth = cardWidth * HAND_CARD_OVERLAP_RATIO;
    return {
      transform: CSS.Transform.toString(transform),
      transition,
      ["--hand-card-max-width" as string]: `${overlapWidth}px`,
    } as React.CSSProperties;
  }, [transform, transition, cardScale, baseCardHeight]);

  const handleContextMenu = React.useCallback((e: React.MouseEvent) => {
    onCardContextMenu?.(e, card);
  }, [onCardContextMenu, card]);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "relative shrink-0 h-full w-auto max-w-[var(--hand-card-max-width)] transition-all duration-200 ease-out group",
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
          faceDown={shouldRenderFaceDown(card, "hand", viewerPlayerId, viewerRole)}
          onContextMenu={handleContextMenu}
          disableDrag // We use Sortable's drag handle
          isDragging={isDragging}
          scale={cardScale}
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
  viewerRole,
  onCardContextMenu,
  className,
  scale = 1,
  cardScale = 1.5,
  baseCardHeight,
}) => {
  // Memoize card IDs array for SortableContext
  const cardIds = React.useMemo(() => cards.map((c) => c.id), [cards]);

  return (
    <div
      className={cn(
        "h-full flex-1 relative min-w-0 w-0", // w-0 enforces flex width constraint
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
          "absolute px-3 py-1 text-md font-bold uppercase tracking-widest text-zinc-400 bg-zinc-900 border border-zinc-700/70 rounded-full z-40 pointer-events-none select-none shadow-[0_2px_10px_rgba(0,0,0,0.45)]",
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
        cardScale={cardScale}
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
                viewerRole={viewerRole}
                onCardContextMenu={onCardContextMenu}
                cardScale={cardScale}
                baseCardHeight={baseCardHeight}
              />
            ))}
          </div>
        </SortableContext>
      </Zone>
    </div>
  );
};

export const Hand = React.memo(HandInner);
