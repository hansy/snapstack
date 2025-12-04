import React from "react";
import { cn } from "../../../lib/utils";
import {
  Player,
  Zone as ZoneType,
  Card as CardType,
  ZoneId,
} from "../../../types";
import { LifeBox } from "../Player/LifeBox";
import { Hand } from "./Hand";
import { Battlefield } from "./Battlefield";
import { Button } from "../../ui/button";
import { Plus } from "lucide-react";
import { CommanderZone } from "./CommanderZone";
import { BottomBar } from "./BottomBar";
import { getCardsInZone, getPlayerZones } from "../../../lib/gameSelectors";
import { SideZone } from "./SideZone";
import { ZONE, ZONE_LABEL } from "../../../constants/zones";

interface SeatProps {
  player: Player;
  position: "bottom-left" | "bottom-right" | "top-left" | "top-right";
  color: string;
  zones: Record<string, ZoneType>;
  cards: Record<string, CardType>;
  isMe: boolean;
  scale?: number;
  className?: string;
  onCardContextMenu?: (e: React.MouseEvent, card: CardType) => void;
  onZoneContextMenu?: (e: React.MouseEvent, zoneId: ZoneId) => void;
  onBattlefieldContextMenu?: (e: React.MouseEvent) => void;
  onLoadDeck?: () => void;
  opponentColors: Record<string, string>;
  onViewZone?: (zoneId: ZoneId, count?: number) => void;
  onDrawCard?: (playerId: string) => void;
  battlefieldScale?: number;
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
  onBattlefieldContextMenu,
  onLoadDeck,
  opponentColors,
  onViewZone,
  onDrawCard,
  battlefieldScale = 1,
}) => {
  const isTop = position.startsWith("top");
  const isRight = position.endsWith("right");

  const playerZones = getPlayerZones(zones, player.id);
  const handZone = playerZones.hand;
  const libraryZone = playerZones.library;
  const graveyardZone = playerZones.graveyard;
  const exileZone = playerZones.exile;
  const battlefieldZone = playerZones.battlefield;
  const commandZone = playerZones.commander;

  const libraryCards = getCardsInZone(cards, libraryZone);
  const graveyardCards = getCardsInZone(cards, graveyardZone);
  const exileCards = getCardsInZone(cards, exileZone);
  const battlefieldCards = getCardsInZone(cards, battlefieldZone);
  const commandCards = getCardsInZone(cards, commandZone);
  const handCards = getCardsInZone(cards, handZone);

  const inverseScale = (1 / scale) * 100;

  return (
    <div
      className={cn(
        "relative w-full h-full",
        // Add borders based on position to create the grid lines
        // position === "bottom-left" && "border-r border-t",
        // position === "bottom-right" && "border-l border-t",
        // position === "top-left" && "border-r border-b",
        // position === "top-right" && "border-l border-b",
        className
      )}
    >
      {/* Scaled Wrapper */}
      <div
        className={cn(
          "flex w-full h-full relative",
          isRight && "flex-row-reverse" // If on right, flip so sidebar is on right (edge)
        )}
        style={{
          width: `${inverseScale}%`,
          height: `${inverseScale}%`,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        {/* Neon Border Glow */}
        <div
          className={cn(
            "absolute inset-0 pointer-events-none",
            // Base border
            "border",
            // Inset Glow
            "shadow-[inset_0_0_20px_var(--tw-shadow-color)]",
            "",

            // Color variants
            color === "rose" && "border-rose-900/20 shadow-rose-400/90",
            color === "violet" && "border-violet-900/20 shadow-violet-400/90",
            color === "sky" && "border-sky-900/20 shadow-sky-400/90",
            color === "amber" && "border-amber-900/20 shadow-amber-400/90"
          )}
        />

        {/* Sidebar */}
        <div
          className={cn(
            "w-40 bg-zinc-900/50 flex flex-col px-4 shrink-0 z-10 items-center border-zinc-800/50 h-full justify-between",
            isRight ? "border-l" : "border-r",
            isTop ? "pb-6" : "pt-6"
          )}
        >
          {/* Player HUD (Life) */}
          <div
            className={cn("w-full flex justify-center", isTop && "order-last")}
          >
            <LifeBox
              player={player}
              isMe={isMe}
              className="origin-center"
              opponentColors={opponentColors}
              isRight={isRight}
            />
          </div>

          {/* Zones */}
          <div
            className={cn(
              "flex flex-col gap-10 w-full items-center flex-1 justify-center",
              isTop && "flex-col-reverse"
            )}
          >
            {/* Library */}
            {libraryZone && (
              <SideZone
                zone={libraryZone}
                card={libraryCards[0]}
                label={ZONE_LABEL.library}
                count={libraryZone.cardIds.length}
                onContextMenu={onZoneContextMenu}
                faceDown
                onDoubleClick={
                  isMe && onDrawCard
                    ? (e) => {
                      e.preventDefault();
                      onDrawCard(player.id);
                    }
                    : undefined
                }
                emptyContent={
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
                  ) : undefined
                }
              />
            )}

            {graveyardZone && (
              <SideZone
                zone={graveyardZone}
                card={graveyardCards[graveyardCards.length - 1]}
                label={ZONE_LABEL.graveyard}
                count={graveyardZone.cardIds.length}
                onContextMenu={onZoneContextMenu}
                onClick={
                  onViewZone && graveyardZone.type === ZONE.GRAVEYARD
                    ? (_e) => onViewZone(graveyardZone.id)
                    : undefined
                }
                faceDown={graveyardCards[graveyardCards.length - 1]?.faceDown}
              />
            )}

            {exileZone && (
              <SideZone
                zone={exileZone}
                card={exileCards[exileCards.length - 1]}
                label={ZONE_LABEL.exile}
                count={exileZone.cardIds.length}
                onContextMenu={onZoneContextMenu}
                onClick={
                  onViewZone && exileZone.type === ZONE.EXILE
                    ? (_e) => onViewZone(exileZone.id)
                    : undefined
                }
                cardClassName="opacity-60 grayscale"
                faceDown={exileCards[exileCards.length - 1]?.faceDown}
              />
            )}
          </div>
        </div>

        {/* Main Area */}
        <div
          className={cn(
            "flex-1 relative flex flex-col",
            isTop ? "border-b border-white/5" : "border-t border-white/5"
          )}
        >
          {battlefieldZone && (
            <Battlefield
              zone={battlefieldZone}
              cards={battlefieldCards}
              player={player}
              isTop={isTop}
              isMe={isMe}
              scale={scale}
              viewScale={battlefieldScale}
              onCardContextMenu={onCardContextMenu}
              onContextMenu={isMe ? onBattlefieldContextMenu : undefined}
            />
          )}

          {/* Bottom Bar (Hand + Commander) */}
          <BottomBar isTop={isTop} isRight={isRight}>
            {/* Commander Zone */}
            {commandZone && (
              <CommanderZone
                zone={commandZone}
                cards={commandCards}
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
                cards={handCards}
                isTop={isTop}
                isRight={isRight}
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
