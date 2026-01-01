import React from 'react';

import type { Card as CardType, Player, ViewerRole, Zone as ZoneType, ZoneId } from '@/types';

import { createSeatModel, type SeatPosition } from '@/models/game/seat/seatModel';
import { SeatView } from './SeatView';

export interface SeatProps {
  player: Player;
  position: SeatPosition;
  color: string;
  zones: Record<ZoneId, ZoneType>;
  cards: Record<string, CardType>;
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
  onLifeContextMenu?: (e: React.MouseEvent, player: Player) => void;
}

const SeatInner: React.FC<SeatProps> = ({
  player,
  position,
  color,
  zones,
  cards,
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
  onLifeContextMenu,
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
        zones,
        cards,
      }),
    [cards, isMe, player.id, position, scale, viewerPlayerId, viewerRole, zones]
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
    />
  );
};

export const Seat = React.memo(SeatInner);
