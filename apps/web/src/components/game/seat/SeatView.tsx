import React from "react";
import { Eye, Plus } from "lucide-react";

import { Button } from "../../ui/button";
import { ZONE, ZONE_LABEL } from "@/constants/zones";
import { canViewerSeeLibraryCardByReveal, canViewerSeeLibraryTopCard } from "@/lib/reveal";
import { cn } from "@/lib/utils";
import type { Card as CardType, Player, ViewerRole, ZoneId } from "@/types";

import { LifeBox } from "../player/LifeBox";
import { Battlefield } from "./Battlefield";
import { BottomBar } from "./BottomBar";
import { CommanderZone } from "./CommanderZone";
import { Hand } from "./Hand";
import { SideZone } from "./SideZone";
import type { SeatModel } from "@/models/game/seat/seatModel";
import {
  HAND_CARD_HEIGHT_RATIO,
  HAND_DEFAULT_HEIGHT,
  HAND_MAX_HEIGHT,
  HAND_MIN_HEIGHT,
} from "./handSizing";
import { BASE_CARD_HEIGHT } from "@/lib/constants";
import {
  SEAT_BOTTOM_BAR_PCT,
  SEAT_HAND_MAX_PCT,
  SEAT_HAND_MIN_PCT,
  useSeatSizing,
} from "@/hooks/game/seat/useSeatSizing";

interface SeatViewProps {
  player: Player;
  color: string;
  isMe: boolean;
  viewerPlayerId: string;
  viewerRole?: ViewerRole;
  scale?: number;
  className?: string;
  opponentColors: Record<string, string>;
  battlefieldScale?: number;
  model: SeatModel;
  onCardContextMenu?: (e: React.MouseEvent, card: CardType) => void;
  onZoneContextMenu?: (e: React.MouseEvent, zoneId: ZoneId) => void;
  onBattlefieldContextMenu?: (e: React.MouseEvent) => void;
  onLoadDeck?: () => void;
  onEditUsername?: () => void;
  onViewZone?: (zoneId: ZoneId, count?: number) => void;
  onDrawCard?: (playerId: string) => void;
  onOpponentLibraryReveals?: (zoneId: ZoneId) => void;
  zoomControlsDisabled?: boolean;
  onLifeContextMenu?: (e: React.MouseEvent, player: Player) => void;
}

export const SeatView: React.FC<SeatViewProps> = ({
  player,
  color,
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
  model,
  zoomControlsDisabled,
  onLifeContextMenu,
}) => {
  const [handHeight, setHandHeight] = React.useState(HAND_DEFAULT_HEIGHT);
  const [hasHandOverride, setHasHandOverride] = React.useState(false);
  const { ref: seatRef, cssVars, sizing, isLg } = useSeatSizing({
    handHeightOverridePx: hasHandOverride ? handHeight : undefined,
  });
  const clamp = React.useCallback(
    (value: number, min: number, max: number) =>
      Math.min(max, Math.max(min, value)),
    []
  );
  const seatHeightPx = sizing?.seatHeightPx;
  const handMinHeightPx = React.useMemo(
    () =>
      isLg && seatHeightPx
        ? seatHeightPx * SEAT_HAND_MIN_PCT
        : HAND_MIN_HEIGHT,
    [isLg, seatHeightPx]
  );
  const handMaxHeightPx = React.useMemo(
    () =>
      isLg && seatHeightPx
        ? seatHeightPx * SEAT_HAND_MAX_PCT
        : HAND_MAX_HEIGHT,
    [isLg, seatHeightPx]
  );
  const handDefaultHeightPx = React.useMemo(
    () =>
      isLg && seatHeightPx
        ? clamp(
            seatHeightPx * SEAT_BOTTOM_BAR_PCT,
            handMinHeightPx,
            handMaxHeightPx
          )
        : HAND_DEFAULT_HEIGHT,
    [clamp, handMaxHeightPx, handMinHeightPx, isLg, seatHeightPx]
  );
  const effectiveHandHeight = isLg && sizing ? sizing.handHeightPx : handHeight;
  const baseCardHeightPx = sizing?.baseCardHeightPx;
  const baseCardWidthPx = sizing?.baseCardWidthPx;
  const handCardScale = React.useMemo(() => {
    const resolvedBaseHeight = baseCardHeightPx ?? BASE_CARD_HEIGHT;
    if (!resolvedBaseHeight) return 1;
    return (effectiveHandHeight * HAND_CARD_HEIGHT_RATIO) / resolvedBaseHeight;
  }, [baseCardHeightPx, effectiveHandHeight]);
  const handleHandHeightChange = React.useCallback((height: number) => {
    setHasHandOverride(true);
    setHandHeight(height);
  }, []);

  const {
    isTop,
    isRight,
    mirrorBattlefieldY,
    inverseScalePercent,
    opponentLibraryRevealCount,
  } = model;
  const { hand, library, graveyard, exile, battlefield, commander } =
    model.zones;
  const {
    library: libraryCards,
    graveyard: graveyardCards,
    exile: exileCards,
  } = model.cards;
  const {
    battlefield: battlefieldCards,
    commander: commandCards,
    hand: handCards,
  } = model.cards;
  const libraryCount = player.libraryCount ?? library?.cardIds.length ?? 0;
  const libraryPlaceholder = React.useMemo(
    () =>
      library
        ? ({
            id: `placeholder:library:${library.ownerId}`,
            name: "Card",
            ownerId: library.ownerId,
            controllerId: library.ownerId,
            zoneId: library.id,
            tapped: false,
            faceDown: false,
            position: { x: 0.5, y: 0.5 },
            rotation: 0,
            counters: [],
          } as CardType)
        : null,
    [library]
  );
  const libraryTopCard =
    libraryCards.length > 0
      ? libraryCards[libraryCards.length - 1]
      : libraryCount > 0
        ? libraryPlaceholder ?? undefined
        : undefined;
  const libraryTopIsPlaceholder = Boolean(
    libraryTopCard?.id && libraryTopCard.id.startsWith("placeholder:library:")
  );
  const canSeeLibraryTop =
    libraryCards.length > 0 && libraryTopCard
      ? canViewerSeeLibraryCardByReveal(
          libraryTopCard,
          viewerPlayerId,
          viewerRole
        ) ||
        canViewerSeeLibraryTopCard({
          viewerId: viewerPlayerId,
          ownerId: library?.ownerId ?? player.id,
          mode: player.libraryTopReveal,
        })
      : false;
  const libraryFaceDown = libraryTopCard ? !canSeeLibraryTop : true;

  return (
    <div
      ref={seatRef}
      className={cn("relative w-full h-full", className)}
      style={cssVars}
    >
      {/* Scaled Wrapper */}
      <div
        className={cn(
          "flex w-full h-full relative",
          isRight && "flex-row-reverse" // If on right, flip so sidebar is on right (edge)
        )}
        style={{
          width: `${inverseScalePercent}%`,
          height: `${inverseScalePercent}%`,
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
            "w-40 bg-zinc-900/50 flex flex-col px-2 shrink-0 z-10 items-center border-zinc-800/50 h-full justify-between lg:w-[var(--sidebar-w)] lg:px-[var(--sidearea-pad)]",
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
              onEditUsername={isMe ? onEditUsername : undefined}
              onContextMenu={
                isMe && onLifeContextMenu
                  ? (e) => onLifeContextMenu(e, player)
                  : undefined
              }
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
            {library && (
              <SideZone
                zone={library}
                card={libraryTopCard}
                label={ZONE_LABEL.library}
                count={libraryCount}
                onContextMenu={onZoneContextMenu}
                faceDown={libraryFaceDown}
                disableCardDrag={libraryTopIsPlaceholder}
                showContextMenuCursor={player.deckLoaded}
                indicatorSide={isRight ? "left" : "right"}
                onClick={
                  !isMe &&
                  opponentLibraryRevealCount > 0 &&
                  onOpponentLibraryReveals
                    ? (e) => {
                        e.preventDefault();
                        onOpponentLibraryReveals(library.id);
                      }
                    : undefined
                }
                rightIndicator={
                  !isMe && opponentLibraryRevealCount > 0 ? (
                    <div className="w-9 h-9 rounded-full bg-zinc-950/95 border border-zinc-700 flex items-center justify-center shadow-lg">
                      <Eye size={20} className="text-white" />
                    </div>
                  ) : undefined
                }
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

            {graveyard && (
              <SideZone
                zone={graveyard}
                card={graveyardCards[graveyardCards.length - 1]}
                label={ZONE_LABEL.graveyard}
                count={graveyard.cardIds.length}
                onContextMenu={onZoneContextMenu}
                onClick={
                  onViewZone && graveyard.type === ZONE.GRAVEYARD
                    ? (_e) => onViewZone(graveyard.id)
                    : undefined
                }
                faceDown={graveyardCards[graveyardCards.length - 1]?.faceDown}
                showContextMenuCursor={false}
              />
            )}

            {exile && (
              <SideZone
                zone={exile}
                card={exileCards[exileCards.length - 1]}
                label={ZONE_LABEL.exile}
                count={exile.cardIds.length}
                onContextMenu={onZoneContextMenu}
                onClick={
                  onViewZone && exile.type === ZONE.EXILE
                    ? (_e) => onViewZone(exile.id)
                    : undefined
                }
                cardClassName="opacity-60 grayscale"
                faceDown={exileCards[exileCards.length - 1]?.faceDown}
                showContextMenuCursor={false}
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
          {battlefield && (
            <Battlefield
              zone={battlefield}
              cards={battlefieldCards}
              player={player}
              isTop={isTop}
              isMe={isMe}
              viewerPlayerId={viewerPlayerId}
              viewerRole={viewerRole}
              mirrorBattlefieldY={mirrorBattlefieldY}
              scale={scale}
              viewScale={battlefieldScale}
              baseCardHeight={baseCardHeightPx}
              baseCardWidth={baseCardWidthPx}
              onCardContextMenu={onCardContextMenu}
              onContextMenu={isMe ? onBattlefieldContextMenu : undefined}
              showContextMenuCursor={Boolean(player.deckLoaded && isMe)}
              playerColors={{ [player.id]: color, ...opponentColors }}
              disableZoomControls={zoomControlsDisabled}
            />
          )}

          {/* Bottom Bar (Hand + Commander) */}
          <BottomBar
            isTop={isTop}
            isRight={isRight}
            height={effectiveHandHeight}
            defaultHeight={handDefaultHeightPx}
            minHeight={handMinHeightPx}
            maxHeight={handMaxHeightPx}
            onHeightChange={isMe ? handleHandHeightChange : undefined}
          >
            {/* Commander Zone */}
            {commander && (
              <CommanderZone
                zone={commander}
                cards={commandCards}
                isTop={isTop}
                isRight={isRight}
                onZoneContextMenu={onZoneContextMenu}
                scale={scale}
                color={color}
              />
            )}

            {/* Hand */}
            {hand && (
              <Hand
                zone={hand}
                cards={handCards}
                isTop={isTop}
                isRight={isRight}
                isMe={isMe}
                viewerPlayerId={viewerPlayerId}
                viewerRole={viewerRole}
                onCardContextMenu={onCardContextMenu}
                scale={scale}
                cardScale={handCardScale}
                baseCardHeight={baseCardHeightPx}
              />
            )}
          </BottomBar>
        </div>
      </div>
    </div>
  );
};
