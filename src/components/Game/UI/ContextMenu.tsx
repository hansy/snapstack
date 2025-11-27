import React, { useEffect, useRef } from 'react';
import { cn } from '../../../lib/utils';

export interface ContextMenuItem {
    label: string;
    action: () => void;
    danger?: boolean;
}

interface ContextMenuProps {
    x: number;
    y: number;
    items: ContextMenuItem[];
    onClose: () => void;
    className?: string;
    title?: string;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, items, onClose, className, title }) => {
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                onClose();
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [onClose]);

    // Adjust position to keep in viewport
    const style: React.CSSProperties = {
        top: y,
        left: x,
    };

    return (
        <div
            ref={menuRef}
            className={cn("fixed z-50 min-w-[160px] bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl py-1 overflow-hidden", className)}
            style={style}
        >
            {title && (
                <div className="px-4 py-2 border-b border-zinc-700 mb-1">
                    <div className="font-semibold text-sm text-zinc-100 truncate max-w-[200px]">{title}</div>
                    <div className="text-xs text-zinc-500 mt-0.5">Actions:</div>
                </div>
            )}
            {items.map((item, index) => (
                <button
                    key={index}
                    className={cn(
                        "w-full text-left px-4 py-2 text-sm hover:bg-zinc-700 transition-colors",
                        item.danger ? "text-red-400 hover:bg-red-900/20" : "text-zinc-200"
                    )}
                    onClick={() => {
                        item.action();
                        onClose();
                    }}
                >
                    {item.label}
                </button>
            ))}
        </div>
    );
};
