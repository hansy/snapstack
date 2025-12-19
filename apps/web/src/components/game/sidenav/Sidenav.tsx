import React from "react";

import { SidenavView } from "./SidenavView";
import { useSidenavController, type SidenavControllerInput } from "@/hooks/game/sidenav/useSidenavController";

export type SidenavProps = SidenavControllerInput;

export const Sidenav: React.FC<SidenavProps> = (props) => {
  const controller = useSidenavController(props);
  return <SidenavView {...controller} />;
};

