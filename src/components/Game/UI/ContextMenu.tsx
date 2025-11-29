import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { FloatingPortal, autoUpdate, flip, offset, shift, useFloating, type VirtualElement } from '@floating-ui/react';
import { cn } from '../../../lib/utils';
import { ContextMenuItem } from '../context/menu';

interface ContextMenuProps {
    x?: number;
    y?: number;
    referenceElement?: HTMLElement | VirtualElement;
    items: ContextMenuItem[];
    onClose: () => void;
    className?: string;
    title?: string;
    isSubmenu?: boolean;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, referenceElement, items, onClose, className, title, isSubmenu = false }) => {
    const menuRef = useRef<HTMLDivElement>(null);
    const [activeSubmenuIndex, setActiveSubmenuIndex] = useState<number | null>(null);
    const [submenuReference, setSubmenuReference] = useState<HTMLElement | null>(null);

    const anchorVirtualElement = useMemo<VirtualElement | null>(() => {
        if (x == null || y == null) return null;
        return {
            getBoundingClientRect: () => ({
                x,
                y,
                top: y,
                left: x,
                right: x,
                bottom: y,
                width: 0,
                height: 0,
            }),
            contextElement: menuRef.current ?? undefined,
        };
    }, [x, y]);

    const { refs, floatingStyles } = useFloating({
        placement: isSubmenu ? 'right-start' : 'bottom-start',
        strategy: 'fixed',
        middleware: [
            offset(isSubmenu ? { mainAxis: 4, alignmentAxis: -8 } : 6),
            flip({ fallbackAxisSideDirection: 'start' }),
            shift({ padding: 8 }),
        ],
        elements: {
            reference: referenceElement ?? anchorVirtualElement ?? undefined,
        },
        whileElementsMounted: autoUpdate,
    });

    useEffect(() => {
        if (referenceElement) {
            refs.setReference(referenceElement);
        } else if (anchorVirtualElement) {
            refs.setReference(anchorVirtualElement);
        }
    }, [referenceElement, anchorVirtualElement, refs]);

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

    useEffect(() => {
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && !isSubmenu) {
                onClose();
            }
        };
        document.addEventListener('keydown', handleEscape);
        return () => {
            document.removeEventListener('keydown', handleEscape);
        };
    }, [onClose, isSubmenu]);

    const handleMouseEnter = (index: number, e: React.MouseEvent<HTMLButtonElement>) => {
        if (items[index].submenu) {
            setActiveSubmenuIndex(index);
            setSubmenuReference(e.currentTarget);
        } else {
            setActiveSubmenuIndex(null);
            setSubmenuReference(null);
        }
    };

    return (
        <FloatingPortal>
            <div
                ref={(node) => {
                    menuRef.current = node;
                    refs.setFloating(node);
                }}
                className={cn(
                    "z-50 min-w-[160px] max-w-[280px] max-h-[70vh] overflow-auto bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl py-1",
                    className
                )}
                style={floatingStyles}
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
                        {item.submenu && activeSubmenuIndex === index && submenuReference && (
                            <ContextMenu
                                referenceElement={submenuReference}
                                items={item.submenu}
                                onClose={onClose}
                                isSubmenu={true}
                            />
                        )}
                    </React.Fragment>
                ))}
            </div>
        </FloatingPortal>
    );
};

export type { ContextMenuItem } from '../context/menu';
