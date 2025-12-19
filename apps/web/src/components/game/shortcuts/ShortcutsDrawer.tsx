import React from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GAME_SHORTCUTS, formatShortcutBinding } from '@/models/game/shortcuts/gameShortcuts';

interface ShortcutsDrawerProps {
    isOpen: boolean;
    onClose: () => void;
}

export const ShortcutsDrawer: React.FC<ShortcutsDrawerProps> = ({ isOpen, onClose }) => {
    return (
        <>
            {/* Backdrop */}
            <div
                className={cn(
                    "fixed inset-0 bg-black/10 z-[60] transition-opacity duration-300",
                    isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
                )}
                onClick={onClose}
            />

            {/* Drawer */}
            <div
                className={cn(
                    "fixed left-[3.5rem] top-4 bottom-4 w-96 bg-zinc-950/90 border border-zinc-800 z-[61] transition-transform duration-300 ease-in-out flex flex-col shadow-2xl backdrop-blur-md rounded-r-xl rounded-l-md",
                    isOpen ? "translate-x-0 pointer-events-auto" : "-translate-x-[120%] pointer-events-none"
                )}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-zinc-800/50 bg-zinc-900/50 rounded-tl-md rounded-tr-xl">
                    <h2 className="font-bold text-zinc-100 uppercase tracking-wider text-sm flex items-center gap-2">
                        Keyboard Shortcuts
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-zinc-100 transition-colors"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent">
                    <div className="space-y-1">
                        {GAME_SHORTCUTS.map((shortcut) => {
                            const label = formatShortcutBinding(shortcut.binding);
                            const keys = label.split('+');

                            return (
                                <div key={shortcut.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-zinc-900/40 transition-colors group border border-transparent hover:border-zinc-800">
                                    <div className="flex flex-col gap-0.5 max-w-[65%]">
                                        <div className="text-zinc-200 font-medium text-sm">
                                            {shortcut.title}
                                        </div>
                                        <div className="text-zinc-500 text-xs leading-tight">
                                            {shortcut.description}
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-1.5 shrink-0">
                                        {keys.map((k, i) => (
                                            <React.Fragment key={i}>
                                                <div className="
                                                    px-2 py-1 
                                                    min-w-[28px] text-center
                                                    bg-zinc-200 text-zinc-900 
                                                    font-bold font-mono text-xs 
                                                    rounded 
                                                    border-b-4 border-zinc-400 
                                                    shadow-sm
                                                    transform active:translate-y-[2px] active:border-b-2
                                                    transition-all
                                                    uppercase
                                                ">
                                                    {k}
                                                </div>
                                                {i < keys.length - 1 && <span className="text-zinc-600 text-[10px]">+</span>}
                                            </React.Fragment>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </>
    );
};
