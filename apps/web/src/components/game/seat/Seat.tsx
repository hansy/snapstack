import React from "react";

import type {
  Card as CardType,
  LibraryRevealsToAll,
  Player,
  ViewerRole,
  Zone as ZoneType,
  ZoneId,
} from "@/types";

import {
  createSeatModel,
  type SeatPosition,
} from "@/models/game/seat/seatModel";
import { SeatView } from "./SeatView";

export interface SeatProps {
  player: Player;
  position: SeatPosition;
  color: string;
  zones: Record<ZoneId, ZoneType>;
  cards: Record<string, CardType>;
  libraryRevealsToAll?: LibraryRevealsToAll;
  isMe: boolean;
  viewerPlayerId: string;
  viewerRole?: ViewerRole;
  scale?: number;
  className?: string;
  onCardContextMenu?: (e: React.MouseEvent, card: CardType) => void;
  onZoneContextMenu?: (e: React.MouseEvent, zoneId: ZoneId) => void;
  onBattlefieldContextMenu?: (e: React.MouseEvent) => void;
  onLoadDeck?: () => void;
  onEditUsername?: () => void;
  opponentColors: Record<string, string>;
  onViewZone?: (zoneId: ZoneId, count?: number) => void;
  onDrawCard?: (playerId: string) => void;
  battlefieldScale?: number;
  onOpponentLibraryReveals?: (zoneId: ZoneId) => void;
  zoomControlsDisabled?: boolean;
  onLifeContextMenu?: (e: React.MouseEvent, player: Player) => void;
  layoutVariant?: "default" | "portrait-viewport";
  onPortraitCommanderDrawerOpenChange?: (open: boolean) => void;
}

const SeatInner: React.FC<SeatProps> = ({
  player,
  position,
  color,
  zones,
  cards,
  libraryRevealsToAll,
  isMe,
  viewerPlayerId,
  viewerRole,
  scale = 1,
  className,
  onCardContextMenu,
  onZoneContextMenu,
  onBattlefieldContextMenu,
  onLoadDeck,
  onEditUsername,
  opponentColors,
  onViewZone,
  onDrawCard,
  battlefieldScale = 1,
  onOpponentLibraryReveals,
  zoomControlsDisabled,
  onLifeContextMenu,
  layoutVariant = "default",
  onPortraitCommanderDrawerOpenChange,
}) => {
  const model = React.useMemo(
    () =>
      createSeatModel({
        playerId: player.id,
        position,
        viewerPlayerId,
        viewerRole,
        isMe,
        scale,
        libraryTopReveal: player.libraryTopReveal,
        zones,
        cards,
        libraryRevealsToAll,
      }),
    [
      cards,
      isMe,
      player.id,
      player.libraryTopReveal,
      position,
      scale,
      viewerPlayerId,
      viewerRole,
      libraryRevealsToAll,
      zones,
    ]
  );

  return (
    <SeatView
      player={player}
      color={color}
      isMe={isMe}
      viewerPlayerId={viewerPlayerId}
      viewerRole={viewerRole}
      scale={scale}
      className={className}
      onCardContextMenu={onCardContextMenu}
      onZoneContextMenu={onZoneContextMenu}
      onBattlefieldContextMenu={onBattlefieldContextMenu}
      onLoadDeck={onLoadDeck}
      onEditUsername={onEditUsername}
      opponentColors={opponentColors}
      onViewZone={onViewZone}
      onDrawCard={onDrawCard}
      battlefieldScale={battlefieldScale}
      onOpponentLibraryReveals={onOpponentLibraryReveals}
      onLifeContextMenu={onLifeContextMenu}
      model={model}
      zoomControlsDisabled={zoomControlsDisabled}
      layoutVariant={layoutVariant}
      onPortraitCommanderDrawerOpenChange={onPortraitCommanderDrawerOpenChange}
    />
  );
};

export const Seat = React.memo(SeatInner);
