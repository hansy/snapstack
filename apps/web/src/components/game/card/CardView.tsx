import React from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { CARD_BASE_CLASS } from "@/lib/constants";

import type { CardViewProps } from "./types";
import { CardFace } from "./CardFace";

export const CardView = React.memo(
  React.forwardRef<HTMLDivElement, CardViewProps>(
    (
      {
        card,
        style,
        className,
        imageClassName,
        onContextMenu,
        faceDown,
        isDragging,
        onDoubleClick,
        onClick,
        onMouseEnter,
        onMouseLeave,
        imageTransform,
        preferArtCrop = false,
        rotateLabel,
        highlightColor,
        disableHoverAnimation,
        isSelected,
        showCommanderBadge,
        ...props
      },
      ref
    ) => {
      const customTextNode = React.useMemo(
        () =>
          card.customText ? (
            <div className="bg-zinc-900/90 text-zinc-100 text-sm px-1.5 py-0.5 rounded-sm border border-zinc-700 shadow-sm leading-tight whitespace-normal break-words">
              {card.customText}
            </div>
          ) : null,
        [card.customText]
      );

      return (
        <div
          ref={ref}
          style={style}
          data-card-id={card.id}
          {...props}
          draggable={false}
          className={cn(
            CARD_BASE_CLASS,
            "origin-center bg-zinc-800 rounded-lg shadow-md shadow-[inset_0_0_24px_rgba(0,0,0,0.35)] flex flex-col items-center justify-center select-none relative z-0 transition-transform duration-200 ease-out",
            !isDragging &&
              !disableHoverAnimation &&
              "hover:scale-105 hover:shadow-xl hover:z-10 hover:border-indigo-500/50 cursor-grab active:cursor-grabbing",
            card.tapped && "border-zinc-600 bg-zinc-900",
            isDragging &&
              "shadow-[0_20px_50px_rgba(0,0,0,0.5)] ring-2 ring-indigo-500 cursor-grabbing",
            isSelected && "outline outline-2 outline-indigo-400/80 outline-offset-2",
            highlightColor === "rose" &&
              "ring-2 ring-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.5)]",
            highlightColor === "violet" &&
              "ring-2 ring-violet-500 shadow-[0_0_15px_rgba(139,92,246,0.5)]",
            highlightColor === "sky" &&
              "ring-2 ring-sky-500 shadow-[0_0_15px_rgba(14,165,233,0.5)]",
            highlightColor === "amber" &&
              "ring-2 ring-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.5)]",
            className
          )}
          onDoubleClick={onDoubleClick}
          onClick={onClick}
          onContextMenu={onContextMenu}
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
          onDragStart={(e) => e.preventDefault()}
        >
          {showCommanderBadge && (
            <div className="absolute left-1 top-1 z-20 flex h-6 w-6 items-center justify-center rounded-full border border-amber-400/70 bg-zinc-950/80 text-amber-300 shadow-sm pointer-events-none">
              <Star className="h-3.5 w-3.5 fill-amber-400" />
            </div>
          )}
          <CardFace
            card={card}
            faceDown={faceDown}
            imageClassName={imageClassName}
            imageTransform={imageTransform}
            preferArtCrop={preferArtCrop}
            rotateLabel={rotateLabel}
            customTextPosition="center"
            customTextNode={customTextNode}
          />
        </div>
      );
    }
  )
);

CardView.displayName = "CardView";
