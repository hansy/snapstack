import React, { useState } from 'react';
import { RefreshCw, Plus, ScrollText, Share2, LogOut } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { useGameStore } from '../../../store/gameStore';

interface NavIconProps {
    icon: React.ReactNode;
    label: string;
    onClick?: () => void;
    className?: string;
}

const NavIcon: React.FC<NavIconProps> = ({ icon, label, onClick, className }) => (
    <button
        onClick={onClick}
        className={cn(
            "relative group p-3 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50 rounded-lg transition-all",
            className
        )}
    >
        {icon}
        {/* Tooltip */}
        <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2 py-1 bg-zinc-900 text-xs text-zinc-300 rounded border border-zinc-800 opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity">
            {label}
        </div>
    </button>
);

interface SidenavProps {
    onCreateToken?: () => void;
    onToggleLog?: () => void;
    onCopyLink?: () => void;
    onLeaveGame?: () => void;
}

export const Sidenav: React.FC<SidenavProps> = ({ onCreateToken, onToggleLog, onCopyLink, onLeaveGame }) => {
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    const myPlayerId = useGameStore((state) => state.myPlayerId);
    const untapAll = useGameStore((state) => state.untapAll);

    return (
        <>
            {/* Persistent Rail */}
            <div className="fixed left-0 top-0 h-full w-12 flex flex-col items-center py-4 bg-zinc-950 border-r border-zinc-800 z-[60]">
                {/* Top: Untap */}
                <NavIcon
                    icon={<RefreshCw size={20} />}
                    label="Untap All"
                    onClick={() => untapAll(myPlayerId)}
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

                {/* Bottom: Share & S Logo (Menu) */}
                <div className="flex flex-col items-center gap-2">
                    <NavIcon
                        icon={<Share2 size={20} />}
                        label="Click to copy room link and share with others"
                        onClick={onCopyLink}
                        className="hover:text-indigo-400"
                    />

                    <div
                        className="relative"
                        onMouseEnter={() => setIsMenuOpen(true)}
                        onMouseLeave={() => setIsMenuOpen(false)}
                    >
                        <button
                            className="w-8 h-8 flex items-center justify-center font-bold text-xl text-indigo-500 hover:text-indigo-400 transition-colors font-serif"
                        >
                            S
                        </button>

                        {/* Menu Popup */}
                        {isMenuOpen && (
                            <div className="absolute left-full bottom-0 w-64 pl-2 z-50">
                                <div className="bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl p-2 flex flex-col gap-1 animate-in fade-in slide-in-from-left-2">
                                    <div className="px-2 py-1 text-xs font-semibold text-zinc-500 uppercase tracking-wider border-b border-zinc-800 mb-1">
                                        Snapstack Menu
                                    </div>

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

            {/* Overlay for Menu (Optional, to close on click outside) */}
            {isMenuOpen && (
                <div
                    className="fixed inset-0 z-40"
                    onClick={() => setIsMenuOpen(false)}
                />
            )}
        </>
    );
};

