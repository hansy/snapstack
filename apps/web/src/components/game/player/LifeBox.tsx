import React from "react";

import { LifeBoxView } from "./LifeBoxView";
import { useLifeBoxController, type LifeBoxControllerInput } from "@/hooks/game/player/useLifeBoxController";

export type LifeBoxProps = LifeBoxControllerInput;

const LifeBoxInner: React.FC<LifeBoxProps> = (props) => {
  const controller = useLifeBoxController(props);
  return <LifeBoxView {...controller} />;
};

export const LifeBox = React.memo(LifeBoxInner);

