import React from "react";

import { cn } from "@/lib/utils";

export const CardFaceNameLabel: React.FC<{
  showNameLabel: boolean;
  displayName: string;
  rotateLabel?: boolean;
}> = ({ showNameLabel, displayName, rotateLabel }) => {
  if (!showNameLabel) return null;

  return (
    <div className="absolute left-1/2 bottom-full w-[160%] -translate-x-1/2 flex justify-center z-10 pointer-events-none">
      <div
        className={cn(
          "bg-zinc-900/90 text-zinc-100 text-md px-1.5 py-0.5 rounded-sm border border-zinc-700 shadow-sm leading-tight text-center inline-block w-fit max-w-full break-words text-ellipsis",
          rotateLabel && "rotate-180"
        )}
      >
        {displayName}
      </div>
    </div>
  );
};

