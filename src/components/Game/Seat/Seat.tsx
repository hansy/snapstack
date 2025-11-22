import React from 'react';
import { cn } from '../../../lib/utils';
import { Player, Zone as ZoneType, Card as CardType, ZoneId } from '../../../types';
import { Card } from '../Card/Card';
import { Zone } from '../Zone/Zone';
import { LifeBox } from '../Player/LifeBox';
import { Hand } from './Hand';
import { Battlefield } from './Battlefield';
import { Button } from '../../ui/button';
import { Plus } from 'lucide-react';
import { CommanderZone } from './CommanderZone';
import { BottomBar } from './BottomBar';
import { ZONE_SIDEWAYS_CLASSES } from '../../../lib/constants';

interface SeatProps {
  player: Player;
  position: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';
  color: string;
  zones: Record<string, ZoneType>;
  cards: Record<string, CardType>;
  isMe: boolean;
  scale?: number;
  className?: string;
  onCardContextMenu?: (e: React.MouseEvent, card: CardType) => void;
  onZoneContextMenu?: (e: React.MouseEvent, zoneId: ZoneId) => void;
  onLoadDeck?: () => void;
  ghostCard?: { zoneId: string; position: { x: number; y: number }; tapped?: boolean } | null;
  opponentColors: Record<string, string>;
}

export const Seat: React.FC<SeatProps> = ({
  player,
  position,
  color,
  zones,
  cards,
  isMe,
  scale = 1,
  className,
  onCardContextMenu,
  onZoneContextMenu,
  onLoadDeck,
  ghostCard,
  opponentColors
}) => {
  const isTop = position.startsWith('top');
  const isRight = position.endsWith('right');

  // Find zones for this player
  const findZone = (type: string) => Object.values(zones).find(z => z.ownerId === player.id && z.type === type);

  const handZone = findZone('hand');
  const libraryZone = findZone('library');
  const graveyardZone = findZone('graveyard');
  const exileZone = findZone('exile');
  const battlefieldZone = findZone('battlefield');

  // Helper to get cards
  const getCards = (zone?: ZoneType) => zone ? zone.cardIds.map(id => cards[id]).filter(Boolean) : [];

  const inverseScale = 1 / scale * 100;

  return (
    <div className={cn(
      "relative w-full h-full border-zinc-800",
      // Add borders based on position to create the grid lines
      position === 'bottom-left' && "border-r border-t",
      position === 'bottom-right' && "border-l border-t",
      position === 'top-left' && "border-r border-b",
      position === 'top-right' && "border-l border-b",
      // Background tint
      `bg-${color}-950/10`,
      className
    )}>
      {/* Scaled Wrapper */}
      <div
        className={cn(
          "flex w-full h-full",
          isRight && "flex-row-reverse" // If on right, flip so sidebar is on right (edge)
        )}
        style={{
          width: `${inverseScale}%`,
          height: `${inverseScale}%`,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
        }}
      >
        {/* Sidebar */}
        <div className={cn(
          "w-40 bg-zinc-900/50 flex flex-col p-4 shrink-0 z-10 items-center border-zinc-800/50 h-full justify-between",
          isRight ? "border-l" : "border-r" // Border faces the content
        )}>
          {/* Player HUD (Life) */}
          <div className={cn("w-full flex justify-center", isTop && "order-last")}>
            <LifeBox player={player} isMe={isMe} className="origin-center" opponentColors={opponentColors} />
          </div>

          {/* Zones */}
          <div className={cn("flex flex-col gap-10 w-full items-center flex-1 justify-center", isTop && "flex-col-reverse")}>
            {/* Library */}
            {libraryZone && (
              <div
                className="relative group"
                onContextMenu={(e) => onZoneContextMenu?.(e, libraryZone.id)}
              >
                <Zone zone={libraryZone} className={cn(ZONE_SIDEWAYS_CLASSES, "bg-zinc-800/30 rounded-lg border-2 border-dashed border-zinc-700 flex items-center justify-center relative cursor-context-menu")}>
                  {libraryZone.cardIds.length > 0 ? (
                    <div className="w-full h-full relative overflow-hidden rounded-lg">
                      <Card
                        card={getCards(libraryZone)[0]}
                        faceDown
                        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rotate-90 scale-90 pointer-events-none origin-center"
                      />
                    </div>
                  ) : (
                    isMe && onLoadDeck && !player.deckLoaded ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={onLoadDeck}
                        className="h-full w-full flex flex-col gap-1 text-zinc-300 bg-indigo-600/20 hover:bg-indigo-600/40 hover:text-white border border-indigo-500/30"
                      >
                        <Plus size={20} />
                        <span className="text-[10px] font-medium">Load Deck</span>
                      </Button>
                    ) : (
                      <span className="text-zinc-600 text-xs">Empty</span>
                    )
                  )}

                  {/* Overlay Info */}
                  <div className="absolute left-1/2 -translate-x-1/2 bg-zinc-900 px-2 text-[10px] text-zinc-400 uppercase tracking-wider font-semibold whitespace-nowrap border border-zinc-800 rounded-full z-10 -top-3">
                    Library
                  </div>
                  <div className="absolute left-1/2 -translate-x-1/2 bg-zinc-900 px-2 text-xs text-zinc-300 font-mono border border-zinc-800 rounded-full z-10 -bottom-3">
                    {libraryZone.cardIds.length}
                  </div>
                </Zone>
              </div>
            )}

            {/* Graveyard */}
            {graveyardZone && (
              <div
                className="relative group"
                onContextMenu={(e) => onZoneContextMenu?.(e, graveyardZone.id)}
              >
                <Zone zone={graveyardZone} className={cn(ZONE_SIDEWAYS_CLASSES, "bg-zinc-800/30 rounded-lg border-2 border-dashed border-zinc-700 flex items-center justify-center relative")}>
                  {graveyardZone.cardIds.length > 0 ? (
                    <div className="w-full h-full relative overflow-hidden rounded-lg">
                      <Card
                        card={getCards(graveyardZone)[getCards(graveyardZone).length - 1]}
                        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rotate-90 scale-90 pointer-events-none origin-center"
                      />
                    </div>
                  ) : (
                    <span className="text-zinc-600 text-xs">Empty</span>
                  )}

                  {/* Overlay Info */}
                  <div className="absolute left-1/2 -translate-x-1/2 bg-zinc-900 px-2 text-[10px] text-zinc-400 uppercase tracking-wider font-semibold whitespace-nowrap border border-zinc-800 rounded-full z-10 -top-3">
                    Graveyard
                  </div>
                  <div className="absolute left-1/2 -translate-x-1/2 bg-zinc-900 px-2 text-xs text-zinc-300 font-mono border border-zinc-800 rounded-full z-10 -bottom-3">
                    {graveyardZone.cardIds.length}
                  </div>
                </Zone>
              </div>
            )}

            {/* Exile */}
            {exileZone && (
              <div
                className="relative group"
                onContextMenu={(e) => onZoneContextMenu?.(e, exileZone.id)}
              >
                <Zone zone={exileZone} className={cn(ZONE_SIDEWAYS_CLASSES, "bg-zinc-800/30 rounded-lg border-2 border-dashed border-zinc-700 flex items-center justify-center relative")}>
                  {exileZone.cardIds.length > 0 ? (
                    <div className="w-full h-full relative overflow-hidden rounded-lg">
                      <Card
                        card={getCards(exileZone)[getCards(exileZone).length - 1]}
                        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rotate-90 scale-90 pointer-events-none opacity-60 grayscale origin-center"
                      />
                    </div>
                  ) : (
                    <span className="text-zinc-600 text-xs">Empty</span>
                  )}

                  {/* Overlay Info */}
                  <div className="absolute left-1/2 -translate-x-1/2 bg-zinc-900 px-2 text-[10px] text-zinc-400 uppercase tracking-wider font-semibold whitespace-nowrap border border-zinc-800 rounded-full z-10 -top-3">
                    Exile
                  </div>
                  <div className="absolute left-1/2 -translate-x-1/2 bg-zinc-900 px-2 text-xs text-zinc-300 font-mono border border-zinc-800 rounded-full z-10 -bottom-3">
                    {exileZone.cardIds.length}
                  </div>
                </Zone>
              </div>
            )}
          </div>
        </div>

        {/* Main Area */}
        <div className="flex-1 relative flex flex-col">
          {battlefieldZone && (
            <Battlefield
              zone={battlefieldZone}
              cards={getCards(battlefieldZone)}
              player={player}
              isTop={isTop}
              scale={scale}
              ghostCard={ghostCard}
              onCardContextMenu={onCardContextMenu}
            />
          )}

          {/* Bottom Bar (Hand + Commander) */}
          <BottomBar isTop={isTop} isRight={isRight}>
            {/* Commander Zone */}
            {findZone('command') && (
              <CommanderZone
                zone={findZone('command')!}
                cards={getCards(findZone('command')!)}
                isTop={isTop}
                isRight={isRight}
                onZoneContextMenu={onZoneContextMenu}
                scale={scale}
              />
            )}

            {/* Hand */}
            {handZone && (
              <Hand
                zone={handZone}
                cards={getCards(handZone)}
                isTop={isTop}
                isMe={isMe}
                onCardContextMenu={onCardContextMenu}
                scale={scale}
              />
            )}
          </BottomBar>


        </div>
      </div>
    </div>
  );
};

