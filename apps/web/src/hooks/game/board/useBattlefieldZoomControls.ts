import * as React from "react";

import { isTypingTarget } from "../shortcuts/model";
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
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      if (isBlocked) return;

      const key = event.key;
      if (key === "-" || key === "_" || key === "NumpadSubtract") {
        adjustScale("out");
        event.preventDefault();
        event.stopPropagation();
      } else if (key === "+" || key === "=" || key === "NumpadAdd") {
        adjustScale("in");
        event.preventDefault();
        event.stopPropagation();
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [adjustScale, enabled, isBlocked]);

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
