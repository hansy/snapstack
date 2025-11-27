import React, { useState } from 'react';
import { RefreshCw, Plus, Trash2 } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { useGameStore } from '../../../store/gameStore';
import { v4 as uuidv4 } from 'uuid';
import { ZONE } from '../../../constants/zones';

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

export const Sidenav: React.FC = () => {
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    const myPlayerId = useGameStore((state) => state.myPlayerId);
    const addCard = useGameStore((state) => state.addCard);
    const untapAll = useGameStore((state) => state.untapAll);

    const handleCreateToken = () => {
        const battlefieldId = `${myPlayerId}-${ZONE.BATTLEFIELD}`;
        addCard({
            id: uuidv4(),
            name: 'Token',
            typeLine: 'Token',
            controllerId: myPlayerId,
            ownerId: myPlayerId,
            zoneId: battlefieldId,
            position: { x: 100, y: 100 },
            tapped: false,
            counters: [],
            faceDown: false,
            rotation: 0
        });
        setIsMenuOpen(false);
    };

    const handleReset = () => {
        if (confirm('Are you sure you want to reset your game? This will clear your board and remove ghost players.')) {
            localStorage.removeItem('snapstack-storage');
            window.location.reload();
        }
    };

    return (
        <>
            {/* Persistent Rail */}
            <div className="fixed left-0 top-0 h-full w-12 flex flex-col items-center py-4 bg-zinc-950 border-r border-zinc-800 z-50">
                {/* Top: Untap */}
                <NavIcon
                    icon={<RefreshCw size={20} />}
                    label="Untap All"
                    onClick={() => untapAll(myPlayerId)}
                    className="hover:text-blue-400"
                />

                <div className="flex-1" />

                {/* Bottom: S Logo (Menu) */}
                <div className="relative">
                    <button
                        onClick={() => setIsMenuOpen(!isMenuOpen)}
                        className="w-8 h-8 flex items-center justify-center font-bold text-xl text-indigo-500 hover:text-indigo-400 transition-colors font-serif"
                    >
                        S
                    </button>

                    {/* Menu Popup */}
                    {isMenuOpen && (
                        <div className="absolute left-full bottom-0 ml-2 w-64 bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl p-2 flex flex-col gap-1 animate-in fade-in slide-in-from-left-2 z-50">
                            <div className="px-2 py-1 text-xs font-semibold text-zinc-500 uppercase tracking-wider border-b border-zinc-800 mb-1">
                                Snapstack Menu
                            </div>

                            <button
                                onClick={handleCreateToken}
                                className="flex items-center gap-3 p-2 rounded hover:bg-zinc-800 text-left text-sm text-zinc-300 hover:text-white transition-colors"
                            >
                                <Plus size={16} className="text-emerald-400" />
                                Create Token
                            </button>

                            <div className="h-px bg-zinc-800 my-1" />

                            <button
                                onClick={handleReset}
                                className="flex items-center gap-3 p-2 rounded hover:bg-red-900/20 text-left text-sm text-red-400 hover:text-red-300 transition-colors"
                            >
                                <Trash2 size={16} />
                                Reset Game
                            </button>
                        </div>
                    )}
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
