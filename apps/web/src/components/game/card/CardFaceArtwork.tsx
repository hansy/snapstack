import React from "react";

import { cn } from "@/lib/utils";

export const CardFaceArtwork: React.FC<{
  faceDown?: boolean;
  displayImageUrl?: string;
  displayName: string;
  imageClassName?: string;
  imageTransform?: string;
}> = ({ faceDown, displayImageUrl, displayName, imageClassName, imageTransform }) => {
  if (faceDown) {
    return (
      <div className="w-full h-full bg-indigo-900/50 rounded border-2 border-indigo-500/30 flex items-center justify-center bg-[url('/mtg_card_back.jpeg')] bg-cover bg-center" />
    );
  }

  if (displayImageUrl) {
    return (
      <img
        src={displayImageUrl}
        alt={displayName}
        loading="lazy"
        decoding="async"
        draggable={false}
        className={cn("w-full h-full object-cover rounded pointer-events-none", imageClassName)}
        style={
          imageTransform
            ? { transform: imageTransform, transformOrigin: "center center" }
            : undefined
        }
      />
    );
  }

  return (
    <div className="text-md text-center font-medium text-zinc-300 px-2">{displayName}</div>
  );
};
