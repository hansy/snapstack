import type { FC } from "react";

import { useMultiplayerBoardController } from "@/hooks/game/board/useMultiplayerBoardController";
import { RoomFullScreen } from "@/components/game/room/RoomFullScreen";
import { clearInviteTokenFromUrl } from "@/lib/partyKitToken";
import { MultiplayerBoardView } from "./MultiplayerBoardView";

interface MultiplayerBoardProps {
  sessionId: string;
}

export const MultiplayerBoard: FC<MultiplayerBoardProps> = ({ sessionId }) => {
  const controller = useMultiplayerBoardController(sessionId);
  const {
    joinBlocked,
    joinBlockedReason,
    viewerRole,
    setViewerRole,
    roomOverCapacity,
    ...viewProps
  } = controller;
  const isSpectator = viewerRole === "spectator";
  const canSpectate =
    joinBlockedReason === "full" || joinBlockedReason === "locked";
  if (roomOverCapacity) {
    return (
      <RoomFullScreen
        title="Room over capacity"
        description="This room has more than the supported number of players."
        onLeave={viewProps.handleLeave}
      />
    );
  }
  if (joinBlocked && !isSpectator) {
    if (joinBlockedReason === "invite") {
      return (
        <RoomFullScreen
          title="Game in session"
          description="Use need to be invited to join this game."
          onLeave={viewProps.handleLeave}
        />
      );
    }
    return (
      <RoomFullScreen
        onLeave={viewProps.handleLeave}
        onSpectate={
          canSpectate
            ? () => {
                clearInviteTokenFromUrl();
                setViewerRole("spectator");
              }
            : undefined
        }
      />
    );
  }
  return (
    <MultiplayerBoardView
      {...viewProps}
      viewerRole={viewerRole}
      setViewerRole={setViewerRole}
      joinBlockedReason={joinBlockedReason}
    />
  );
};
