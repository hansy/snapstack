import React from "react";

import { Button } from "@/components/ui/button";

type RoomFullScreenProps = {
  onLeave: () => void;
  onSpectate?: () => void;
  title?: string;
  description?: string;
  leaveLabel?: string;
};

export const RoomFullScreen: React.FC<RoomFullScreenProps> = ({
  onLeave,
  onSpectate,
  title = "Room is full",
  description = "This room is locked or already has the maximum number of players.",
  leaveLabel = "Back to home",
}) => {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center bg-zinc-950 text-zinc-100">
      <div className="max-w-xl w-full px-8 py-12 rounded-2xl border border-zinc-800 bg-zinc-900/60 shadow-lg text-center">
        <h1 className="text-3xl font-semibold tracking-tight mb-3">{title}</h1>
        <p className="text-zinc-300 mb-8">{description}</p>
        <div className="flex flex-col gap-3">
          <Button onClick={onLeave} className="w-full">
            {leaveLabel}
          </Button>
          {onSpectate && (
            <Button variant="secondary" onClick={onSpectate} className="w-full">
              Join as spectator
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
