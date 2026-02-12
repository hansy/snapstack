import React from "react";
import {
  Coins,
  Dice5,
  Keyboard,
  Loader2,
  LogOut,
  Plus,
  CornerUpLeft,
  ScrollText,
  Share2,
  Wifi,
} from "lucide-react";

import drawspellLogo from "@/assets/drawspell-logo.png";
import { cn } from "@/lib/utils";

import type { SidenavController } from "@/hooks/game/sidenav/useSidenavController";

interface NavIconProps {
  icon: React.ReactNode;
  label: string;
  tooltip?: string;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
  hideTooltip?: boolean;
}

const NavIcon: React.FC<NavIconProps> = ({
  icon,
  label,
  tooltip,
  onClick,
  className,
  disabled = false,
  hideTooltip = false,
}) => (
  <button
    type="button"
    aria-label={label}
    onClick={onClick}
    disabled={disabled}
    className={cn(
      "relative group p-3 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-zinc-400",
      className,
    )}
  >
    {icon}
    {!hideTooltip && (
      <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2 py-1 bg-zinc-900 text-xs text-zinc-300 rounded border border-zinc-800 opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity">
        {tooltip ?? label}
      </div>
    )}
  </button>
);

export const SidenavView: React.FC<SidenavController> = ({
  onCreateToken,
  onOpenCoinFlipper,
  onOpenDiceRoller,
  onToggleLog,
  onOpenShareDialog,
  shareLinksReady,
  onLeaveGame,
  syncStatus,
  peerCounts,
  isLogOpen,
  isMenuOpen,
  openMenu,
  closeMenu,
  handleUntapAll,
  handleOpenShortcuts,
  isSpectator,
  orientation,
}) => {
  const isHorizontal = orientation === "horizontal";
  const peerCountLabel = React.useMemo(() => {
    const parts: string[] = [];
    if (peerCounts.players > 0) {
      parts.push(
        `${peerCounts.players} ${peerCounts.players === 1 ? "player" : "players"}`,
      );
    }
    if (peerCounts.spectators > 0) {
      parts.push(
        `${peerCounts.spectators} ${
          peerCounts.spectators === 1 ? "spectator" : "spectators"
        }`,
      );
    }
    if (parts.length === 0) {
      return "0 players";
    }
    return parts.join(", ");
  }, [peerCounts.players, peerCounts.spectators]);
  const shareDisabled = !shareLinksReady;
  const shareTooltip = shareLinksReady
    ? "Share room"
    : syncStatus !== "connected"
      ? "Connecting to room"
      : "Loading auth tokens for sharing";
  const handleMenuToggle = React.useCallback(() => {
    if (isMenuOpen) {
      closeMenu();
      return;
    }
    openMenu();
  }, [closeMenu, isMenuOpen, openMenu]);

  const menu = (
    <div
      className={cn(
        "items-center",
        isHorizontal ? "flex flex-row-reverse gap-1" : "flex flex-col gap-2",
      )}
    >
      {!isSpectator && (
        <NavIcon
          icon={<Share2 size={20} />}
          label="Share room"
          tooltip={shareTooltip}
          onClick={onOpenShareDialog}
          className="hover:text-indigo-400"
          disabled={shareDisabled}
          hideTooltip={isHorizontal}
        />
      )}

      <div
        className="relative"
        onMouseEnter={isHorizontal ? undefined : openMenu}
        onMouseLeave={isHorizontal ? undefined : closeMenu}
      >
        <button
          type="button"
          aria-label="Open menu"
          onClick={handleMenuToggle}
          className="w-8 h-8 flex items-center justify-center transition-transform duration-200 hover:scale-105"
        >
          <img
            src={drawspellLogo}
            alt=""
            aria-hidden="true"
            className="w-6 h-6"
          />
        </button>

        {isMenuOpen && (
          <div
            className={cn(
              "absolute w-64 z-50",
              isHorizontal ? "right-0 bottom-full mb-2" : "left-full bottom-0 pl-2",
            )}
          >
            <div
              className={cn(
                "bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl p-2 flex flex-col gap-1 animate-in fade-in",
                isHorizontal ? "slide-in-from-bottom-2" : "slide-in-from-left-2",
              )}
            >
              <div className="px-2 py-1 text-xs font-semibold text-zinc-500 uppercase tracking-wider border-b border-zinc-800 mb-1">
                Drawspell Menu
              </div>

              {!isSpectator && (
                <>
                  <div className="flex items-center gap-3 p-2 text-sm">
                    {syncStatus === "connected" ? (
                      <>
                        <Wifi size={16} className="text-emerald-400" />
                        <span className="text-zinc-300">
                          Connected
                          <span className="text-zinc-500 ml-1">
                            ({peerCountLabel})
                          </span>
                        </span>
                      </>
                    ) : (
                      <>
                        <Loader2
                          size={16}
                          className="text-amber-400 animate-spin"
                        />
                        <span className="text-amber-400">Connecting...</span>
                      </>
                    )}
                  </div>

                  <div className="border-t border-zinc-800 my-1" />

                  <button
                    onClick={handleOpenShortcuts}
                    className="flex items-center gap-3 p-2 rounded hover:bg-zinc-800 text-left text-sm text-zinc-300 hover:text-zinc-100 transition-colors"
                  >
                    <Keyboard size={16} />
                    Keyboard Shortcuts
                  </button>
                </>
              )}

              <button
                onClick={onLeaveGame}
                className="flex items-center gap-3 p-2 rounded hover:bg-red-900/20 text-left text-sm text-red-400 hover:text-red-300 transition-colors"
              >
                {isSpectator ? "Leave Game" : <LogOut size={16} />}
                {isSpectator ? null : "Leave Game"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      <div
        className={cn(
          "bg-zinc-950 z-[60]",
          isHorizontal
            ? "h-[var(--mobile-sidenav-h,3.75rem)] w-full border-t border-zinc-800 px-2 flex flex-row-reverse items-center gap-1"
            : "sticky top-0 h-[100dvh] w-12 lg:w-[var(--sidenav-w)] border-r border-zinc-800 py-4 flex flex-col items-center",
        )}
      >
        {isSpectator ? (
          <>
            <NavIcon
              icon={<ScrollText size={20} />}
              label="Game Log"
              onClick={onToggleLog}
              className={cn(
                "hover:text-amber-400",
                isLogOpen && "text-amber-400 bg-amber-500/10",
              )}
              hideTooltip={isHorizontal}
            />

            <div className="flex-1" />

            {menu}
          </>
        ) : (
          <>
            <NavIcon
              icon={<CornerUpLeft size={20} />}
              label="Untap All"
              onClick={handleUntapAll}
              className="hover:text-blue-400"
              disabled={isSpectator}
              hideTooltip={isHorizontal}
            />

            <NavIcon
              icon={<Plus size={20} />}
              label="Create Token"
              onClick={onCreateToken}
              className="hover:text-emerald-400"
              disabled={isSpectator}
              hideTooltip={isHorizontal}
            />

            <NavIcon
              icon={<Coins size={20} />}
              label="Flip Coin"
              onClick={onOpenCoinFlipper}
              className="hover:text-yellow-400"
              disabled={isSpectator}
              hideTooltip={isHorizontal}
            />

            <NavIcon
              icon={<Dice5 size={20} />}
              label="Roll Dice"
              onClick={onOpenDiceRoller}
              className="hover:text-indigo-400"
              disabled={isSpectator}
              hideTooltip={isHorizontal}
            />

            <NavIcon
              icon={<ScrollText size={20} />}
              label="Game Log"
              onClick={onToggleLog}
              className={cn(
                "hover:text-amber-400",
                isLogOpen && "text-amber-400 bg-amber-500/10",
              )}
              hideTooltip={isHorizontal}
            />

            <div className="flex-1" />

            {menu}
          </>
        )}
      </div>

      {isMenuOpen && <div className="fixed inset-0 z-40" onClick={closeMenu} />}
    </>
  );
};
