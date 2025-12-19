import * as React from "react";

import type { LayoutMode } from "./usePlayerLayout";

export const useBoardScale = (layoutMode: LayoutMode) => {
  const [scale, setScale] = React.useState(1);

  React.useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;

      // Determine slot size based on layoutMode
      let slotWidth = width;
      let slotHeight = height;

      if (layoutMode === "split") {
        slotHeight = height / 2;
      } else if (layoutMode === "quadrant") {
        slotWidth = width / 2;
        slotHeight = height / 2;
      }

      // Base dimensions that "fit" the UI comfortably
      // Sidebar needs ~500px height (LifeBox + 3 Zones + Gaps)
      // Width needs ~900px for Sidebar + Battlefield
      const BASE_WIDTH = 1000;
      const BASE_HEIGHT = 600;

      const scaleX = slotWidth / BASE_WIDTH;
      const scaleY = slotHeight / BASE_HEIGHT;

      // Calculate scale to fit the content
      // We cap at 1.0 to prevent the UI from becoming too large on big screens
      // We set a floor of 0.5 to prevent it from becoming unreadable
      let newScale = Math.min(scaleX, scaleY);
      newScale = Math.min(newScale, 1);
      newScale = Math.max(newScale, 0.5);

      setScale(newScale);
    };

    window.addEventListener("resize", handleResize);
    handleResize(); // Initial calculation

    return () => window.removeEventListener("resize", handleResize);
  }, [layoutMode]);

  return scale;
};

