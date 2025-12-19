import * as React from "react";

import { useDragStore } from "@/store/dragStore";
import { useGameStore } from "@/store/gameStore";

export const useBattlefieldEdgeZoom = (myPlayerId: string) => {
  const zoomEdge = useDragStore((state) => state.zoomEdge);
  const setBattlefieldViewScale = useGameStore(
    (state) => state.setBattlefieldViewScale
  );

  React.useEffect(() => {
    if (!zoomEdge) return;

    let interval: ReturnType<typeof setInterval> | undefined;

    // Wait a moment before starting the zoom (avoids accidental triggers).
    const timer = setTimeout(() => {
      interval = setInterval(() => {
        const currentScale =
          useGameStore.getState().battlefieldViewScale[myPlayerId] ?? 1;
        let newScale = currentScale;
        const ZOOM_STEP = 0.02;

        if (zoomEdge === "top" || zoomEdge === "left") {
          newScale += ZOOM_STEP;
        } else {
          newScale -= ZOOM_STEP;
        }

        // Clamp between 50% and 100%
        newScale = Math.max(0.5, Math.min(1, newScale));

        if (newScale !== currentScale) {
          setBattlefieldViewScale(myPlayerId, newScale);
        }
      }, 50);
    }, 1000);

    return () => {
      clearTimeout(timer);
      if (interval) clearInterval(interval);
    };
  }, [zoomEdge, myPlayerId, setBattlefieldViewScale]);
};

