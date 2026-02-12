import React from "react";

import { LogDrawerView } from "./LogDrawerView";
import { useLogDrawerController } from "@/hooks/game/log-drawer/useLogDrawerController";

export interface LogDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  playerColors: Record<string, string>;
  layout?: "sidebar" | "stacked";
}

export const LogDrawer: React.FC<LogDrawerProps> = (props) => {
  const { layout = "sidebar", ...controllerInput } = props;
  const controller = useLogDrawerController(controllerInput);
  return <LogDrawerView {...controller} layout={layout} />;
};
