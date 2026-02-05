import React from "react";
import { Eye } from "lucide-react";

import type { Card as CardType } from "@/types";
import { Tooltip } from "@/components/ui/tooltip";
import { CARD_ASPECT_CLASS } from "@/lib/constants";
import { cn } from "@/lib/utils";

import { CardFace } from "./CardFace";

interface CardPreviewViewProps {
  currentCard: CardType;
  previewCard: CardType;
  locked?: boolean;
  onClose?: () => void;
  style?: React.CSSProperties;
  showControllerRevealIcon: boolean;
  controllerRevealToAll: boolean;
  controllerRevealNames: string[];
  hasMultipleFaces: boolean;
  onFlip: (e: React.MouseEvent) => void;
  flipRotation: number;
  showAncillary: boolean;
  isController: boolean;
  customTextNode?: React.ReactNode;
  showPT: boolean;
  displayPower?: string;
  displayToughness?: string;
  ptBasePower?: string;
  ptBaseToughness?: string;
  onPTDelta: (type: "power" | "toughness", delta: number) => void;
}

export const CardPreviewView = React.forwardRef<HTMLDivElement, CardPreviewViewProps>(
  (
    {
      currentCard,
      previewCard,
      locked,
      onClose,
      style,
      showControllerRevealIcon,
      controllerRevealToAll,
      controllerRevealNames,
      hasMultipleFaces,
      onFlip,
      flipRotation,
      showAncillary,
      isController,
      customTextNode,
      showPT,
      displayPower,
      displayToughness,
      ptBasePower,
      ptBaseToughness,
      onPTDelta,
    },
    ref
  ) => {
    const comparisonPower = ptBasePower ?? currentCard.basePower;
    const comparisonToughness = ptBaseToughness ?? currentCard.baseToughness;
    return (
      <div
        ref={ref}
        data-card-preview
        className={cn(
          "fixed z-[9999] rounded-xl shadow-2xl bg-zinc-900 transition-opacity duration-200 ease-out",
          locked ? "pointer-events-auto" : "pointer-events-none",
          CARD_ASPECT_CLASS
        )}
        style={style}
        onContextMenu={(e) => e.preventDefault()}
      >
      {locked && onClose && (
        <div className="absolute -top-10 -right-16 flex items-center gap-2">
          {/* Revealed Icon - Only visible to controller */}
          {showControllerRevealIcon && (
            <Tooltip
              placement="left"
              content={
                <div className="flex flex-col gap-1 min-w-[140px]">
                  <div className="font-bold border-b border-zinc-700 pb-1">
                    Revealed to:
                  </div>
                  {controllerRevealToAll ? (
                    <div>Everyone</div>
                  ) : (
                    <div className="flex flex-col gap-0.5">
                      {controllerRevealNames.map((name, idx) => (
                        <div key={`${idx}-${name}`}>{name}</div>
                      ))}
                    </div>
                  )}
                </div>
              }
            >
              <div className="p-2 bg-zinc-900 hover:bg-zinc-800 rounded-full text-zinc-400 hover:text-white transition-colors border border-zinc-700 shadow-lg cursor-help">
                <Eye size={16} strokeWidth={2} />
              </div>
            </Tooltip>
          )}
          {hasMultipleFaces && (
            <Tooltip content="Preview transform/flip" placement="left">
              <button
                onClick={onFlip}
                className="p-2 bg-zinc-900 hover:bg-zinc-800 rounded-full text-zinc-400 hover:text-white transition-colors border border-zinc-700 shadow-lg"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38" />
                </svg>
              </button>
            </Tooltip>
          )}
          <Tooltip content="Close preview" placement="left">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              className="p-2 bg-zinc-900 hover:bg-zinc-800 rounded-full text-zinc-400 hover:text-white transition-colors border border-zinc-700 shadow-lg"
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
          </Tooltip>
        </div>
      )}

      {/* Token Label */}
      {currentCard.isToken && (
        <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-zinc-900/90 text-zinc-400 text-xs font-bold px-3 py-1 rounded-full border border-zinc-700 shadow-lg z-40 uppercase tracking-wider">
          Token
        </div>
      )}

      <CardFace
        card={previewCard}
        countersClassName={showAncillary ? "top-4 -right-2" : "hidden"}
        imageClassName="object-cover"
        imageTransform={flipRotation ? `rotate(${flipRotation}deg)` : undefined}
        preferArtCrop={false}
        interactive={showAncillary && locked && isController}
        hidePT={true}
        showCounterLabels={showAncillary}
        hideRevealIcon={true}
        showNameLabel={false}
        customTextPosition="sidebar"
        customTextNode={customTextNode}
      />

      {/* External Power/Toughness (Always rendered, but buttons only accessible when locked) */}
      {showAncillary && showPT && (
        <div className="absolute bottom-0 left-full ml-4 bg-zinc-900 px-3 py-2 rounded-lg border border-zinc-700 shadow-xl z-50 flex items-center gap-3 min-w-max">
          {/* Power */}
          <div className="relative group/pt flex items-center justify-center w-12 h-10">
            <span
              className={cn(
                "text-2xl font-bold text-center z-0",
                parseInt(displayPower || "0") >
                  parseInt(comparisonPower || "0")
                  ? "text-green-500"
                  : parseInt(displayPower || "0") <
                    parseInt(comparisonPower || "0")
                    ? "text-red-500"
                    : "text-white"
              )}
            >
              {displayPower}
            </span>

            {/* Overlay Controls */}
            {isController && (
              <div className="absolute inset-0 flex items-center justify-between opacity-0 group-hover/pt:opacity-100 transition-opacity z-10">
                <button
                  className="h-full w-1/2 flex items-center justify-center bg-zinc-900/80 hover:bg-zinc-800/90 text-white font-bold rounded-l text-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onPTDelta("power", -1);
                  }}
                >
                  -
                </button>
                <button
                  className="h-full w-1/2 flex items-center justify-center bg-zinc-900/80 hover:bg-zinc-800/90 text-white font-bold rounded-r text-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onPTDelta("power", 1);
                  }}
                >
                  +
                </button>
              </div>
            )}
          </div>

          <span className="text-zinc-600 font-bold text-xl">/</span>

          {/* Toughness */}
          <div className="relative group/pt flex items-center justify-center w-12 h-10">
            <span
              className={cn(
                "text-2xl font-bold text-center z-0",
                parseInt(displayToughness || "0") >
                  parseInt(comparisonToughness || "0")
                  ? "text-green-500"
                  : parseInt(displayToughness || "0") <
                    parseInt(comparisonToughness || "0")
                    ? "text-red-500"
                    : "text-white"
              )}
            >
              {displayToughness}
            </span>

            {/* Overlay Controls */}
            {isController && (
              <div className="absolute inset-0 flex items-center justify-between opacity-0 group-hover/pt:opacity-100 transition-opacity z-10">
                <button
                  className="h-full w-1/2 flex items-center justify-center bg-zinc-900/80 hover:bg-zinc-800/90 text-white font-bold rounded-l text-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onPTDelta("toughness", -1);
                  }}
                >
                  -
                </button>
                <button
                  className="h-full w-1/2 flex items-center justify-center bg-zinc-900/80 hover:bg-zinc-800/90 text-white font-bold rounded-r text-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onPTDelta("toughness", 1);
                  }}
                >
                  +
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      </div>
    );
  }
);

CardPreviewView.displayName = "CardPreviewView";
