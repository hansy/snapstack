import React from "react";
import { Eye } from "lucide-react";

import { Tooltip } from "@/components/ui/tooltip";

import type { CardFaceRevealModel } from "@/models/game/card/cardFaceModel";

export const CardFaceRevealBadge: React.FC<{
  reveal: CardFaceRevealModel | null;
}> = ({ reveal }) => {
  if (!reveal) return null;

  return (
    <Tooltip
      placement="right"
      content={
        <div className="flex flex-col gap-1">
          <div className="font-bold border-b border-zinc-700 pb-1">
            Revealed to:
          </div>
          {reveal.toAll ? (
            <div>Everyone</div>
          ) : (
            <div className="flex flex-col gap-0.5">
              {reveal.playerNames.map((name, idx) => (
                <div key={`${idx}-${name}`}>{name}</div>
              ))}
            </div>
          )}
        </div>
      }
    >
      <div
        className="absolute top-1 left-1 z-20 bg-zinc-900/90 rounded-full p-1 border border-zinc-700 shadow-md"
        title={reveal.title}
      >
        <Eye className="text-white h-2 w-2" />
      </div>
    </Tooltip>
  );
};
