import React, { useEffect, useRef, useState } from 'react';
import { cn } from '../../../lib/utils';
import { ContextMenuItem } from '../context/menu';
import { ChevronRight } from 'lucide-react';

interface ContextMenuProps {
    x: number;
    y: number;
    items: ContextMenuItem[];
    onClose: () => void;
    className?: string;
    title?: string;
    isSubmenu?: boolean;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, items, onClose, className, title, isSubmenu = false }) => {
    const menuRef = useRef<HTMLDivElement>(null);
    const [activeSubmenuIndex, setActiveSubmenuIndex] = useState<number | null>(null);
    const [submenuPosition, setSubmenuPosition] = useState<{ x: number; y: number } | null>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                // Only close if it's the root menu
                if (!isSubmenu) {
                    onClose();
                }
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [onClose, isSubmenu]);

    // Adjust position to keep in viewport (basic implementation)
    // For submenus, we might want to be smarter, but this is a start.
    const style: React.CSSProperties = {
        top: y,
        left: x,
    };

    const handleMouseEnter = (index: number, e: React.MouseEvent<HTMLButtonElement>) => {
        setActiveSubmenuIndex(index);
        const rect = e.currentTarget.getBoundingClientRect();
        setSubmenuPosition({
            x: rect.right,
            y: rect.top
        });
    };

    return (
        <div
            ref={menuRef}
            className={cn(
                "fixed z-50 min-w-[160px] bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl py-1 overflow-visible", // overflow-visible for submenus if we nested them directly, but we are using fixed positioning
                className
            )}
            style={style}
        >
            {title && (
                <div className="px-4 py-2 border-b border-zinc-700 mb-1">
                    <div className="font-semibold text-sm text-zinc-100 truncate max-w-[200px]">{title}</div>
                    <div className="text-xs text-zinc-500 mt-0.5">Actions:</div>
                </div>
            )}
            {items.map((item, index) => (
                <React.Fragment key={index}>
                    {item.separator ? (
                        <div className="h-px bg-zinc-700 my-1 mx-2" />
                    ) : (
                        <button
                            className={cn(
                                "w-full text-left px-4 py-2 text-sm hover:bg-zinc-700 transition-colors flex items-center justify-between group",
                                item.danger ? "text-red-400 hover:bg-red-900/20" : "text-zinc-200",
                                activeSubmenuIndex === index && "bg-zinc-700"
                            )}
                            onClick={() => {
                                if (!item.submenu) {
                                    item.action();
                                    onClose(); // Close all menus
                                }
                            }}
                            onMouseEnter={(e) => handleMouseEnter(index, e)}
                        >
                            <span>{item.label}</span>
                            {item.submenu && <ChevronRight className="w-4 h-4 text-zinc-500 group-hover:text-zinc-300" />}
                        </button>
                    )}

                    {/* Render Submenu */}
                    {item.submenu && activeSubmenuIndex === index && submenuPosition && (
                        <ContextMenu
                            x={submenuPosition.x}
                            y={submenuPosition.y}
                            items={item.submenu}
                            onClose={onClose}
                            isSubmenu={true}
                        />
                    )}
                </React.Fragment>
            ))}
        </div>
    );
};

export type { ContextMenuItem } from '../context/menu';
