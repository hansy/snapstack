import React from "react";

import { LogDrawerView } from "./LogDrawerView";
import { useLogDrawerController } from "@/hooks/game/log-drawer/useLogDrawerController";

export interface LogDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  playerColors: Record<string, string>;
}

export const LogDrawer: React.FC<LogDrawerProps> = (props) => {
  const controller = useLogDrawerController(props);
  return <LogDrawerView {...controller} />;
};

