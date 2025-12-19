import React from "react";

import type { CardProps } from "./types";

import { CardView } from "./CardView";
import { useCardController } from "@/hooks/game/card/useCardController";

export type { CardViewProps } from "./types";
export { CardView } from "./CardView";

const CardInner: React.FC<CardProps> = (props) => {
  const controller = useCardController(props);
  return (
    <CardView
      ref={controller.ref}
      {...controller.cardViewProps}
      {...controller.draggableProps}
    />
  );
};

export const Card = React.memo(CardInner);
