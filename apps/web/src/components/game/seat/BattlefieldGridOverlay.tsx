import * as React from "react";

type BattlefieldGridOverlayProps = {
  visible: boolean;
  gridStepX: number;
  gridStepY: number;
};

const GRID_COLOR = "rgba(148, 163, 184, 0.3)";

export const BattlefieldGridOverlay = React.memo(
  ({ visible, gridStepX, gridStepY }: BattlefieldGridOverlayProps) => {
    if (!visible) return null;
    const style = React.useMemo(
      () => ({
        backgroundImage: `radial-gradient(circle, ${GRID_COLOR} 2px, transparent 2px)`,
        backgroundSize: `${gridStepX}px ${gridStepY}px`,
        backgroundPosition: `-${gridStepX / 2}px -${gridStepY / 2}px`,
      }),
      [gridStepX, gridStepY]
    );

    return (
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={style}
      />
    );
  }
);

BattlefieldGridOverlay.displayName = "BattlefieldGridOverlay";
