import React from "react";

import { Button } from "@/components/ui/button";

type RoomFullScreenProps = {
  onLeave: () => void;
  title?: string;
  description?: string;
};

export const RoomFullScreen: React.FC<RoomFullScreenProps> = ({
  onLeave,
  title = "Room is full",
  description = "This room is locked or already has the maximum number of players.",
}) => {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-950 text-zinc-100">
      <div className="max-w-xl w-full px-8 py-12 rounded-2xl border border-zinc-800 bg-zinc-900/60 shadow-lg text-center">
        <h1 className="text-3xl font-semibold tracking-tight mb-3">{title}</h1>
        <p className="text-zinc-300 mb-8">{description}</p>
        <Button onClick={onLeave} className="w-full">
          Back to home
        </Button>
      </div>
    </div>
  );
};
