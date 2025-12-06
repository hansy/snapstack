import React, { useEffect, useState } from "react";
import { Card as CardType } from "../../../types";
import { CARD_ASPECT_RATIO } from "../../../lib/constants";
import { cn } from "../../../lib/utils";
import { CardFace } from "./CardFace";

import { useGameStore } from "../../../store/gameStore";
import {
  getCurrentFace,
  getDisplayPower,
  getDisplayToughness,
  getFlipRotation,
  shouldShowPowerToughness,
} from "../../../lib/cardDisplay";

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

  // Subscribe to the live card data to ensure we have the latest P/T and counters
  const liveCard = useGameStore((state) => state.cards[card.id]);

  // Use liveCard if available, otherwise fallback to the prop (snapshot)
  const currentCard = liveCard || card;
  const showPT = shouldShowPowerToughness(currentCard);
  const displayPower = getDisplayPower(currentCard);
  const displayToughness = getDisplayToughness(currentCard);
  const flipRotation = getFlipRotation(currentCard);

  useEffect(() => {
    const calculatePosition = () => {
      const calculatedHeight = width * 1.4;

      let top = anchorRect.top - calculatedHeight - GAP;
      let left = anchorRect.left + anchorRect.width / 2 - width / 2;

      // Viewport Collision Detection
      // Default is ABOVE.
      // If it goes off the TOP, try BELOW.
      if (top < GAP) {
        const topBelow = anchorRect.bottom + GAP;
        // Check if BELOW fits in the viewport
        if (topBelow + calculatedHeight <= window.innerHeight - GAP) {
          top = topBelow;
        } else {
          // If neither fits perfectly, pick the one with MORE space or clamp?
          // For now, if top is cut off, we force below, but we might need to clamp it to bottom edge if it's too tall?
          // Actually, if it's too tall for below, it will be cropped.
          // Let's try to keep it on screen.
          if (topBelow + calculatedHeight > window.innerHeight) {
            // If below is also too big, maybe align to bottom?
            // But we want it near the card.
            // Let's just stick to the logic: if top is bad, go below.
            top = topBelow;
          }
        }
      }

      // Clamp left to viewport
      const maxLeft = window.innerWidth - width - GAP;
      left = Math.max(GAP, Math.min(left, maxLeft));

      setStyle({ top, left, opacity: 1 });
      setIsPositioned(true);
    };

    // Run immediately
    calculatePosition();

    // Optional: Re-calculate on scroll/resize
    // window.addEventListener('resize', calculatePosition);
    // window.addEventListener('scroll', calculatePosition);
    // return () => { ... }
  }, [anchorRect, width]);

  const handleUpdatePT = (type: "power" | "toughness", delta: number) => {
    const faceStat = getCurrentFace(currentCard)?.[type];
    const currentVal = parseInt((currentCard as any)[type] ?? faceStat ?? "0");
    if (isNaN(currentVal)) return;
    updateCard(currentCard.id, { [type]: (currentVal + delta).toString() });
  };

  // Don't render until positioned to avoid jump
  if (!isPositioned) return null;

  return (
    <div
      className={cn(
        "fixed z-[9999] rounded-xl shadow-2xl border-2 border-indigo-500/50 bg-zinc-900 transition-opacity duration-200 ease-out",
        locked ? "pointer-events-auto" : "pointer-events-none",
        CARD_ASPECT_RATIO
      )}
      style={{
        top: style.top,
        left: style.left,
        width: width,
        opacity: style.opacity,
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {locked && onClose && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="absolute -top-10 -right-10 z-50 p-2 bg-zinc-900 hover:bg-zinc-800 rounded-full text-zinc-400 hover:text-white transition-colors border border-zinc-700 shadow-lg"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      )}

      {/* Token Label */}
      {currentCard.isToken && (
        <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-zinc-900/90 text-zinc-400 text-xs font-bold px-3 py-1 rounded-full border border-zinc-700 shadow-lg z-40 uppercase tracking-wider">
          Token
        </div>
      )}

      <CardFace
        card={currentCard}
        countersClassName="top-4 -right-2"
        imageClassName="object-cover"
        imageTransform={flipRotation ? `rotate(${flipRotation}deg)` : undefined}
        preferArtCrop={false}
        interactive={locked}
        hidePT={true} // Always hide internal P/T, we render external always
        showCounterLabels={true}
        showNameLabel={false}
        customTextPosition="sidebar"
        customTextNode={
          currentCard.customText ? (
            <div
              className={cn(
                "bg-zinc-900/90 backdrop-blur-sm p-2 rounded-lg border border-zinc-700 shadow-xl min-w-[120px] max-w-[200px] mt-2",
                locked &&
                  currentCard.ownerId === myPlayerId &&
                  "cursor-text hover:border-indigo-500/50 transition-colors"
              )}
              onClick={(e) => {
                if (!locked || currentCard.ownerId !== myPlayerId) return;
                e.stopPropagation();
              }}
            >
              <CustomTextEditor card={currentCard} locked={locked} />
            </div>
          ) : null
        }
      />

      {/* External Power/Toughness (Always rendered, but buttons only accessible when locked) */}
      {showPT && (
        <div className="absolute bottom-0 left-full ml-4 bg-zinc-900 px-3 py-2 rounded-lg border border-zinc-700 shadow-xl z-50 flex items-center gap-3 min-w-max">
          {/* Power */}
          {/* Power */}
          <div className="relative group/pt flex items-center justify-center w-12 h-10">
            <span
              className={cn(
                "text-2xl font-bold text-center z-0",
                parseInt(displayPower || "0") >
                  parseInt(currentCard.basePower || "0")
                  ? "text-green-500"
                  : parseInt(displayPower || "0") <
                      parseInt(currentCard.basePower || "0")
                    ? "text-red-500"
                    : "text-white"
              )}
            >
              {displayPower}
            </span>

            {/* Overlay Controls */}
            <div className="absolute inset-0 flex items-center justify-between opacity-0 group-hover/pt:opacity-100 transition-opacity z-10">
              <button
                className="h-full w-1/2 flex items-center justify-center bg-zinc-900/80 hover:bg-zinc-800/90 text-white font-bold rounded-l text-sm"
                onClick={(e) => {
                  e.stopPropagation();
                  handleUpdatePT("power", -1);
                }}
              >
                -
              </button>
              <button
                className="h-full w-1/2 flex items-center justify-center bg-zinc-900/80 hover:bg-zinc-800/90 text-white font-bold rounded-r text-sm"
                onClick={(e) => {
                  e.stopPropagation();
                  handleUpdatePT("power", 1);
                }}
              >
                +
              </button>
            </div>
          </div>

          <span className="text-zinc-600 font-bold text-xl">/</span>

          {/* Toughness */}
          <div className="relative group/pt flex items-center justify-center w-12 h-10">
            <span
              className={cn(
                "text-2xl font-bold text-center z-0",
                parseInt(displayToughness || "0") >
                  parseInt(currentCard.baseToughness || "0")
                  ? "text-green-500"
                  : parseInt(displayToughness || "0") <
                      parseInt(currentCard.baseToughness || "0")
                    ? "text-red-500"
                    : "text-white"
              )}
            >
              {displayToughness}
            </span>

            {/* Overlay Controls */}
            <div className="absolute inset-0 flex items-center justify-between opacity-0 group-hover/pt:opacity-100 transition-opacity z-10">
              <button
                className="h-full w-1/2 flex items-center justify-center bg-zinc-900/80 hover:bg-zinc-800/90 text-white font-bold rounded-l text-sm"
                onClick={(e) => {
                  e.stopPropagation();
                  handleUpdatePT("toughness", -1);
                }}
              >
                -
              </button>
              <button
                className="h-full w-1/2 flex items-center justify-center bg-zinc-900/80 hover:bg-zinc-800/90 text-white font-bold rounded-r text-sm"
                onClick={(e) => {
                  e.stopPropagation();
                  handleUpdatePT("toughness", 1);
                }}
              >
                +
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
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
  const isOwner = card.ownerId === myPlayerId;

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
        if (locked && isOwner) {
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
