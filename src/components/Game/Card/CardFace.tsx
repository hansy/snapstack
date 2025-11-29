import React from "react";
import { Card as CardType } from "../../../types";
import { cn } from "../../../lib/utils";

interface CardFaceProps {
  card: CardType;
  faceDown?: boolean;
  imageClassName?: string;
  countersClassName?: string;
}

export const CardFace: React.FC<CardFaceProps> = ({
  card,
  faceDown,
  imageClassName,
  countersClassName,
}) => {
  return (
    <>
      {faceDown ? (
        <div className="w-full h-full bg-indigo-900/50 rounded border-2 border-indigo-500/30 flex items-center justify-center bg-[url('/mtg_card_back.jpeg')] bg-cover bg-center" />
      ) : card.imageUrl ? (
        <img
          src={card.imageUrl}
          alt={card.name}
          className={cn(
            "w-full h-full object-cover rounded pointer-events-none",
            imageClassName
          )}
        />
      ) : (
        <div className="text-md text-center font-medium text-zinc-300 px-2">
          {card.name}
        </div>
      )}

      {/* Power/Toughness - Only show on battlefield */}
      {/* Power/Toughness - Only show on battlefield */}
      {(card.power !== undefined && card.toughness !== undefined && card.zoneId.includes('battlefield')) && (
        <div className="absolute bottom-1 right-1 bg-zinc-900/90 px-2 py-1 rounded-sm border border-zinc-700 shadow-sm z-10">
          <span className="text-sm font-bold">
            <span className={cn(
              (parseInt(card.power) > parseInt(card.basePower || '0')) ? "text-green-500" :
                (parseInt(card.power) < parseInt(card.basePower || '0')) ? "text-red-500" : "text-white"
            )}>{card.power}</span>
            <span className="text-zinc-400">/</span>
            <span className={cn(
              (parseInt(card.toughness) > parseInt(card.baseToughness || '0')) ? "text-green-500" :
                (parseInt(card.toughness) < parseInt(card.baseToughness || '0')) ? "text-red-500" : "text-white"
            )}>{card.toughness}</span>
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
              className="group relative flex items-center justify-center w-6 h-6 rounded-full shadow-md border border-white/20 text-white text-[10px] font-bold cursor-help"
              style={{ backgroundColor: counter.color || '#6366f1' }}
            >
              {counter.count}

              {/* Tooltip */}
              <div className="absolute right-full mr-2 px-2 py-1 bg-zinc-900 text-zinc-100 text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50 border border-zinc-700">
                {counter.type}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
};
