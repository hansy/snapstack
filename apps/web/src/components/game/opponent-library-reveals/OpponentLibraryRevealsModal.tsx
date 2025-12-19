import React from "react";

import type { ZoneId } from "@/types";

import { OpponentLibraryRevealsModalView } from "./OpponentLibraryRevealsModalView";
import { useOpponentLibraryRevealsController } from "@/hooks/game/opponent-library-reveals/useOpponentLibraryRevealsController";

export interface OpponentLibraryRevealsModalProps {
  isOpen: boolean;
  onClose: () => void;
  zoneId: ZoneId | null;
}

export const OpponentLibraryRevealsModal: React.FC<OpponentLibraryRevealsModalProps> = (
  props
) => {
  const controller = useOpponentLibraryRevealsController(props);
  if (!controller) return null;
  return <OpponentLibraryRevealsModalView {...controller} />;
};

