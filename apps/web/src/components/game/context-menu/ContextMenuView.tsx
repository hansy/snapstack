import React from "react";
import { ChevronRight } from "lucide-react";
import { FloatingPortal } from "@floating-ui/react";

import { cn } from "@/lib/utils";
import type { ContextMenuItem } from "@/models/game/context-menu/menu";

export type ContextMenuViewProps = {
  setFloating: (node: HTMLDivElement | null) => void;
  floatingStyles: React.CSSProperties;
  items: ContextMenuItem[];
  className?: string;
  title?: string;
  activeSubmenuIndex: number | null;
  submenuReference: HTMLElement | null;
  onItemMouseEnter: (index: number, e: React.MouseEvent<HTMLButtonElement>) => void;
  onItemClick: (item: ContextMenuItem) => void;
  renderSubmenu: (submenuItems: ContextMenuItem[], submenuReference: HTMLElement) => React.ReactNode;
};

export const ContextMenuView: React.FC<ContextMenuViewProps> = ({
  setFloating,
  floatingStyles,
  items,
  className,
  title,
  activeSubmenuIndex,
  submenuReference,
  onItemMouseEnter,
  onItemClick,
  renderSubmenu,
}) => {
  return (
    <FloatingPortal>
      <div
        ref={setFloating}
        data-context-menu-root
        className={cn(
          "z-[10000] pointer-events-auto min-w-[160px] max-w-[280px] max-h-[70vh] overflow-auto bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl py-1",
          className
        )}
        style={floatingStyles}
      >
        {title && (
          <div className="px-4 py-2 border-b border-zinc-700 mb-1">
            <div className="font-semibold text-sm text-zinc-100 truncate max-w-[200px]">
              {title}
            </div>
            <div className="text-xs text-zinc-500 mt-0.5">Actions:</div>
          </div>
        )}

        {items.map((item, index) => {
          if (item.type === "separator") {
            return (
              <div key={item.id ?? index} className="h-px bg-zinc-700 my-1 mx-2" />
            );
          }

          const isDisabled = Boolean(item.disabledReason);
          const showSubmenu = Boolean(
            item.submenu && activeSubmenuIndex === index && submenuReference
          );

          return (
            <React.Fragment key={index}>
              <button
                className={cn(
                  "w-full text-left px-4 py-2 text-sm transition-colors flex items-center justify-between group",
                  item.danger ? "text-red-400 hover:bg-red-900/20" : "text-zinc-200",
                  activeSubmenuIndex === index && "bg-zinc-700",
                  !isDisabled && "hover:bg-zinc-700",
                  isDisabled && "opacity-60 cursor-not-allowed"
                )}
                onClick={() => {
                  if (isDisabled) return;
                  if (!item.submenu) {
                    onItemClick(item);
                  }
                }}
                onMouseEnter={(e) => onItemMouseEnter(index, e)}
                title={item.disabledReason}
                disabled={isDisabled}
              >
                <span className="flex-1 mr-2">{item.label}</span>

                {item.shortcut && (
                  <span className="mr-2 text-[10px] font-medium font-mono text-zinc-500 bg-zinc-950/40 px-1.5 py-0.5 rounded shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)] border-b border-white/5 mx-2 min-w-[20px] text-center">
                    {item.shortcut}
                  </span>
                )}

                {item.checked && (
                  <span className="mr-2 text-indigo-400">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </span>
                )}

                {item.submenu && (
                  <ChevronRight className="w-4 h-4 text-zinc-500 group-hover:text-zinc-300" />
                )}
              </button>

              {showSubmenu &&
                renderSubmenu(item.submenu!, submenuReference as HTMLElement)}
            </React.Fragment>
          );
        })}
      </div>
    </FloatingPortal>
  );
};
