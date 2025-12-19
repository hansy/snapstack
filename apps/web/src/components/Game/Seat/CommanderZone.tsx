import React from "react";

import type { Zone as ZoneType, Card as CardType, ZoneId } from "@/types";

import { CommanderZoneView } from "./CommanderZoneView";
import {
  useCommanderZoneController,
  type CommanderZoneControllerInput,
} from "@/hooks/game/seat/useCommanderZoneController";

export interface CommanderZoneProps {
  zone: ZoneType;
  cards: CardType[];
  isTop: boolean;
  isRight: boolean;
  onZoneContextMenu?: (e: React.MouseEvent, zoneId: ZoneId) => void;
  scale?: number;
  color?: string;
}

export type CommanderZoneControllerProps = CommanderZoneControllerInput;

export const CommanderZone: React.FC<CommanderZoneProps> = (props) => {
  const controller = useCommanderZoneController({ zoneOwnerId: props.zone.ownerId });
  return <CommanderZoneView {...props} {...controller} />;
};

