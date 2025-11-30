import React from "react";
import { Card as CardType } from "../../../types";
import { cn } from "../../../lib/utils";
import { useGameStore } from "../../../store/gameStore";
import {
  getCurrentFace,
  getDisplayImageUrl,
  getDisplayName,
  getDisplayPower,
  getDisplayToughness,
  shouldShowPowerToughness,
} from "../../../lib/cardDisplay";

interface CardFaceProps {
  card: CardType;
  faceDown?: boolean;
  imageClassName?: string;
  imageTransform?: string;
  countersClassName?: string;
  interactive?: boolean;
  hidePT?: boolean;
  showCounterLabels?: boolean;
}

export const CardFace: React.FC<CardFaceProps> = ({
  card,
  faceDown,
  imageClassName,
  imageTransform,
  countersClassName,
  interactive,
  hidePT,
  showCounterLabels,
}) => {
  const addCounterToCard = useGameStore((state) => state.addCounterToCard);
  const removeCounterFromCard = useGameStore((state) => state.removeCounterFromCard);
  const updateCard = useGameStore((state) => state.updateCard);
  const displayImageUrl = getDisplayImageUrl(card);
  const displayName = getDisplayName(card);
  const showPT = shouldShowPowerToughness(card) && card.zoneId.includes('battlefield') && !hidePT;
  const displayPower = getDisplayPower(card);
  const displayToughness = getDisplayToughness(card);

  const handleUpdatePT = (type: 'power' | 'toughness', delta: number) => {
    const faceStat = getCurrentFace(card)?.[type];
    const currentVal = parseInt((card as any)[type] ?? faceStat ?? '0');
    if (isNaN(currentVal)) return;
    updateCard(card.id, { [type]: (currentVal + delta).toString() });
  };

  return (
    <>
      {faceDown ? (
        <div className="w-full h-full bg-indigo-900/50 rounded border-2 border-indigo-500/30 flex items-center justify-center bg-[url('/mtg_card_back.jpeg')] bg-cover bg-center" />
      ) : displayImageUrl ? (
        <img
          src={displayImageUrl}
          alt={displayName}
          className={cn(
            "w-full h-full object-cover rounded pointer-events-none",
            imageClassName
          )}
          style={imageTransform ? { transform: imageTransform, transformOrigin: 'center center' } : undefined}
        />
      ) : (
        <div className="text-md text-center font-medium text-zinc-300 px-2">
          {displayName}
        </div>
      )}

      {/* Power/Toughness - Only show on battlefield */}
      {showPT && (
        <div className={cn(
          "absolute bottom-1 right-1 bg-zinc-900/90 px-2 py-1 rounded-sm border border-zinc-700 shadow-sm z-10",
          interactive && "scale-125 origin-bottom-right"
        )}>
          <span className="text-sm font-bold flex items-center gap-1">
            {/* Power */}
            <div className="relative group/pt">
              <span className={cn(
                (parseInt(displayPower || '0') > parseInt(card.basePower || '0')) ? "text-green-500" :
                  (parseInt(displayPower || '0') < parseInt(card.basePower || '0')) ? "text-red-500" : "text-white"
              )}>{displayPower}</span>
              {interactive && (
                <div className="absolute -top-6 left-1/2 -translate-x-1/2 flex gap-1 opacity-0 group-hover/pt:opacity-100 transition-opacity bg-zinc-900 border border-zinc-700 rounded px-1">
                  <button
                    className="text-xs hover:text-green-400 px-1"
                    onClick={(e) => { e.stopPropagation(); handleUpdatePT('power', 1); }}
                  >+</button>
                  <button
                    className="text-xs hover:text-red-400 px-1"
                    onClick={(e) => { e.stopPropagation(); handleUpdatePT('power', -1); }}
                  >-</button>
                </div>
              )}
            </div>

            <span className="text-zinc-400">/</span>

            {/* Toughness */}
            <div className="relative group/pt">
              <span className={cn(
                (parseInt(displayToughness || '0') > parseInt(card.baseToughness || '0')) ? "text-green-500" :
                  (parseInt(displayToughness || '0') < parseInt(card.baseToughness || '0')) ? "text-red-500" : "text-white"
              )}>{displayToughness}</span>
              {interactive && (
                <div className="absolute -top-6 left-1/2 -translate-x-1/2 flex gap-1 opacity-0 group-hover/pt:opacity-100 transition-opacity bg-zinc-900 border border-zinc-700 rounded px-1">
                  <button
                    className="text-xs hover:text-green-400 px-1"
                    onClick={(e) => { e.stopPropagation(); handleUpdatePT('toughness', 1); }}
                  >+</button>
                  <button
                    className="text-xs hover:text-red-400 px-1"
                    onClick={(e) => { e.stopPropagation(); handleUpdatePT('toughness', -1); }}
                  >-</button>
                </div>
              )}
            </div>
          </span>
        </div>
      )}

      {/* Counters */}
      {card.counters.length > 0 && (
        <div
          className={cn(
            "absolute top-0 right-0 flex flex-col gap-1 items-end pr-1 pt-1",
            countersClassName
          )}
        >
          {card.counters.map((counter, i) => (
            <div
              key={i}
              className="group relative flex items-center justify-center w-6 h-6 rounded-full shadow-md border border-white/20 text-white text-[10px] font-bold cursor-help transition-all hover:z-50"
              style={{ backgroundColor: counter.color || '#6366f1' }}
            >
              {counter.count}

              {/* Label and Buttons (Controlled by showCounterLabels) */}
              {showCounterLabels ? (
                <div className="absolute left-full top-1/2 -translate-y-1/2 pl-2 flex items-center gap-1 h-full z-50">
                  {/* Buttons - Only if interactive */}
                  {interactive && (
                    <div className="flex items-center gap-0.5 w-0 overflow-hidden group-hover:w-auto transition-all duration-200 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto">
                      <button
                        className="w-5 h-5 flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 rounded text-white text-xs border border-zinc-600"
                        onClick={(e) => { e.stopPropagation(); removeCounterFromCard(card.id, counter.type); }}
                      >-</button>
                      <button
                        className="w-5 h-5 flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 rounded text-white text-xs border border-zinc-600"
                        onClick={(e) => { e.stopPropagation(); addCounterToCard(card.id, { ...counter, count: 1 }); }}
                      >+</button>
                    </div>
                  )}

                  {/* Label */}
                  <div className="bg-zinc-900/90 text-zinc-100 text-xs px-2 py-1 rounded border border-zinc-700 whitespace-nowrap shadow-lg pointer-events-none group-hover:pointer-events-auto">
                    {counter.type}
                  </div>
                </div>
              ) : (
                /* Tooltip for non-interactive mode (Battlefield) */
                <div className="absolute right-full mr-2 px-2 py-1 bg-zinc-900 text-zinc-100 text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50 border border-zinc-700">
                  {counter.type}
                </div>
              )}
            </div>

          ))}
        </div >
      )}
    </>
  );
};
