import * as React from "react";

import { useGameStore } from "@/store/gameStore";

export type UseBattlefieldZoomControlsArgs = {
  playerId: string;
  enabled: boolean;
  wheelTarget?: HTMLElement | null;
  isBlocked?: boolean;
};

export const useBattlefieldZoomControls = ({
  playerId,
  enabled,
  wheelTarget,
  isBlocked = false,
}: UseBattlefieldZoomControlsArgs) => {
  const setBattlefieldViewScale = useGameStore(
    (state) => state.setBattlefieldViewScale
  );

  const adjustScale = React.useCallback(
    (direction: "in" | "out") => {
      if (!enabled || isBlocked) return;

      const currentScale =
        useGameStore.getState().battlefieldViewScale[playerId] ?? 1;
      const delta = 0.05;
      const nextScale = direction === "in"
        ? currentScale + delta
        : currentScale - delta;

      setBattlefieldViewScale(playerId, nextScale);
    },
    [enabled, isBlocked, playerId, setBattlefieldViewScale]
  );

  React.useEffect(() => {
    if (!enabled || !wheelTarget) return;

    const handleWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) return;
      if (isBlocked) return;

      const direction = event.deltaY < 0 ? "in" : "out";
      adjustScale(direction);
      event.preventDefault();
    };

    wheelTarget.addEventListener("wheel", handleWheel, { passive: false });
    return () => wheelTarget.removeEventListener("wheel", handleWheel);
  }, [adjustScale, enabled, isBlocked, wheelTarget]);
};
