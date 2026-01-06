import { Awareness, removeAwarenessStates } from "y-protocols/awareness";
import { computePeerCounts, type PeerCounts } from "./peerCount";

export function createAwarenessLifecycle({
  awareness,
  playerId,
  getViewerRole,
  onPeerCounts,
}: {
  awareness: Awareness;
  playerId: string;
  getViewerRole: () => string;
  onPeerCounts: (counts: PeerCounts) => void;
}) {
  const pushLocalAwareness = () => {
    awareness.setLocalStateField("client", {
      id: playerId,
      role: getViewerRole(),
    });
  };

  const handleAwarenessChange = () => {
    onPeerCounts(computePeerCounts(awareness.getStates()));
  };

  const disposeAwareness = () => {
    awareness.setLocalState(null);
    try {
      removeAwarenessStates(awareness, [awareness.clientID], "disconnect");
    } catch (_err) {
      // ignore cleanup errors
    }
  };

  return { pushLocalAwareness, handleAwarenessChange, disposeAwareness };
}
