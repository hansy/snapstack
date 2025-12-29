import type { FC } from "react";

import { useMultiplayerBoardController } from "@/hooks/game/board/useMultiplayerBoardController";
import { RoomFullScreen } from "@/components/game/room/RoomFullScreen";
import { MultiplayerBoardView } from "./MultiplayerBoardView";

interface MultiplayerBoardProps {
  sessionId: string;
}

export const MultiplayerBoard: FC<MultiplayerBoardProps> = ({ sessionId }) => {
  const controller = useMultiplayerBoardController(sessionId);
  const { joinBlocked, roomOverCapacity, ...viewProps } = controller;
  if (roomOverCapacity) {
    return (
      <RoomFullScreen
        title="Room over capacity"
        description="This room has more than the supported number of players."
        onLeave={viewProps.handleLeave}
      />
    );
  }
  if (joinBlocked) {
    return <RoomFullScreen onLeave={viewProps.handleLeave} />;
  }
  return <MultiplayerBoardView {...viewProps} />;
};
