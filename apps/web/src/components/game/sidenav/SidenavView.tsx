import React from "react";
import {
  Keyboard,
  Loader2,
  LogOut,
  Plus,
  RefreshCw,
  ScrollText,
  Share2,
  Wifi,
} from "lucide-react";

import { cn } from "@/lib/utils";

import type { SidenavController } from "@/hooks/game/sidenav/useSidenavController";

interface NavIconProps {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  className?: string;
}

const NavIcon: React.FC<NavIconProps> = ({ icon, label, onClick, className }) => (
  <button
    type="button"
    aria-label={label}
    onClick={onClick}
    className={cn(
      "relative group p-3 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50 rounded-lg transition-all",
      className
    )}
  >
    {icon}
    <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2 py-1 bg-zinc-900 text-xs text-zinc-300 rounded border border-zinc-800 opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity">
      {label}
    </div>
  </button>
);

export const SidenavView: React.FC<SidenavController> = ({
  onCreateToken,
  onToggleLog,
  onCopyLink,
  onLeaveGame,
  syncStatus,
  peerCount,
  isMenuOpen,
  openMenu,
  closeMenu,
  handleUntapAll,
  handleOpenShortcuts,
}) => {
  return (
    <>
      <div className="fixed left-0 top-0 h-full w-12 flex flex-col items-center py-4 bg-zinc-950 border-r border-zinc-800 z-[60]">
        <NavIcon
          icon={<RefreshCw size={20} />}
          label="Untap All"
          onClick={handleUntapAll}
          className="hover:text-blue-400"
        />

        <NavIcon
          icon={<Plus size={20} />}
          label="Create Token"
          onClick={onCreateToken}
          className="hover:text-emerald-400"
        />

        <NavIcon
          icon={<ScrollText size={20} />}
          label="Game Log"
          onClick={onToggleLog}
          className="hover:text-amber-400"
        />

        <div className="flex-1" />

        <div className="flex flex-col items-center gap-2">
          <NavIcon
            icon={<Share2 size={20} />}
            label="Click to copy room link and share with others"
            onClick={onCopyLink}
            className="hover:text-indigo-400"
          />

          <div className="relative" onMouseEnter={openMenu} onMouseLeave={closeMenu}>
            <button
              type="button"
              aria-label="Open menu"
              className="w-8 h-8 flex items-center justify-center font-bold text-xl text-indigo-500 hover:text-indigo-400 transition-colors font-serif"
            >
              S
            </button>

            {isMenuOpen && (
              <div className="absolute left-full bottom-0 w-64 pl-2 z-50">
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl p-2 flex flex-col gap-1 animate-in fade-in slide-in-from-left-2">
                  <div className="px-2 py-1 text-xs font-semibold text-zinc-500 uppercase tracking-wider border-b border-zinc-800 mb-1">
                    Snapstack Menu
                  </div>

                  <div className="flex items-center gap-3 p-2 text-sm">
                    {syncStatus === "connected" ? (
                      <>
                        <Wifi size={16} className="text-emerald-400" />
                        <span className="text-zinc-300">
                          Connected
                          <span className="text-zinc-500 ml-1">
                            ({peerCount} {peerCount === 1 ? "player" : "players"})
                          </span>
                        </span>
                      </>
                    ) : (
                      <>
                        <Loader2 size={16} className="text-amber-400 animate-spin" />
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

                  <button
                    onClick={onLeaveGame}
                    className="flex items-center gap-3 p-2 rounded hover:bg-red-900/20 text-left text-sm text-red-400 hover:text-red-300 transition-colors"
                  >
                    <LogOut size={16} />
                    Leave Game
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {isMenuOpen && <div className="fixed inset-0 z-40" onClick={closeMenu} />}
    </>
  );
};
