import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { useLogStore } from '../../../logging/logStore';
import { LogMessage, LogMessagePart } from '../../../logging/types';
import { cn } from '../../../lib/utils';

interface LogDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    playerColors: Record<string, string>;
}

export const LogDrawer: React.FC<LogDrawerProps> = ({ isOpen, onClose, playerColors }) => {
    const entries = useLogStore((state) => state.entries);
    const scrollRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom when new entries are added
    useEffect(() => {
        if (isOpen && scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [entries, isOpen]);

    // Close on escape key
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    return (
        <>
            {/* Backdrop - click to close */}
            <div
                className={cn(
                    "fixed inset-0 bg-black/10 z-40 transition-opacity duration-300",
                    isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
                )}
                onClick={onClose}
            />

            {/* Drawer */}
            <div
                className={cn(
                    "fixed left-12 top-0 bottom-0 w-80 bg-zinc-950/70 border-r border-zinc-800 z-50 transition-transform duration-300 ease-in-out flex flex-col shadow-2xl backdrop-blur-md",
                    isOpen ? "translate-x-0 pointer-events-auto" : "-translate-x-full pointer-events-none"
                )}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-zinc-800/50 bg-zinc-900/50">
                    <h2 className="font-bold text-zinc-100 uppercase tracking-wider text-sm">Game Log</h2>
                    <button
                        onClick={onClose}
                        className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-zinc-100 transition-colors"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Log Entries */}
                <div
                    ref={scrollRef}
                    className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent"
                >
                    {entries.length === 0 ? (
                        <div className="text-zinc-500 text-xs text-center italic py-4">
                            No events yet
                        </div>
                    ) : (
                        entries.map((entry) => (
                            <LogEntryItem
                                key={entry.id}
                                entry={entry}
                                playerColors={playerColors}
                            />
                        ))
                    )}
                </div>
            </div>
        </>
    );
};

const LogEntryItem: React.FC<{ entry: LogMessage; playerColors: Record<string, string> }> = ({ entry, playerColors }) => {
    // Determine border color based on actor
    const actorColor = entry.actorId ? playerColors[entry.actorId] : undefined;

    // Map tailwind colors to border classes
    const getBorderColorClass = (color?: string) => {
        switch (color) {
            case 'rose': return 'border-rose-500/50';
            case 'violet': return 'border-violet-500/50';
            case 'sky': return 'border-sky-500/50';
            case 'amber': return 'border-amber-500/50';
            case 'emerald': return 'border-emerald-500/50';
            default: return 'border-zinc-700/50';
        }
    };

    return (
        <div className={cn(
            "text-sm bg-zinc-900/40 rounded p-2 border-l-2",
            getBorderColorClass(actorColor)
        )}>
            <div className="flex flex-wrap gap-1 items-baseline leading-relaxed text-zinc-300">
                {entry.parts.map((part, idx) => (
                    <LogPartRenderer key={idx} part={part} />
                ))}
            </div>
            <div className="mt-1 text-[10px] text-zinc-600 text-right">
                {formatTimeAgo(entry.ts)}
            </div>
        </div>
    );
};

const formatTimeAgo = (timestamp: number): string => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return 'long ago';
};

const LogPartRenderer: React.FC<{ part: LogMessagePart }> = ({ part }) => {
    switch (part.kind) {
        case 'player':
            return <span className="font-semibold text-zinc-100">{part.text}</span>;
        case 'card':
            return <span className="text-indigo-300">{part.text}</span>;
        case 'zone':
            return <span className="italic text-zinc-400">{part.text}</span>;
        case 'value':
            return <span className="font-mono text-emerald-400">{part.text}</span>;
        case 'text':
        default:
            return <span>{part.text}</span>;
    }
};
