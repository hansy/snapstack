import React from "react";

import { ZoneViewerModalView } from "./ZoneViewerModalView";
import { useZoneViewerController } from "@/hooks/game/zone-viewer/useZoneViewerController";

interface ZoneViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  zoneId: string | null;
  count?: number; // If set, only show top X cards
}

export const ZoneViewerModal: React.FC<ZoneViewerModalProps> = (props) => {
  const controller = useZoneViewerController(props);
  if (!controller) return null;
  return <ZoneViewerModalView {...controller} />;
};

