import React from "react";

import type { ContextMenuItem } from "@/models/game/context-menu/menu";

import { ContextMenuView } from "./ContextMenuView";
import { useContextMenuController } from "@/hooks/game/context-menu/useContextMenuController";

export interface ContextMenuProps {
  x?: number;
  y?: number;
  referenceElement?: HTMLElement | import("@floating-ui/react").VirtualElement | null;
  items: ContextMenuItem[];
  onClose: () => void;
  className?: string;
  title?: string;
  isSubmenu?: boolean;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
  x,
  y,
  referenceElement,
  items,
  onClose,
  className,
  title,
  isSubmenu = false,
}) => {
  const controller = useContextMenuController({
    x,
    y,
    referenceElement,
    items,
    onClose,
    isSubmenu,
  });

  const handleItemClick = React.useCallback(
    (item: ContextMenuItem) => {
      if (item.type !== "action") return;
      if (item.submenu) return;
      item.onSelect();
      onClose();
    },
    [onClose]
  );

  const renderSubmenu = React.useCallback(
    (submenuItems: ContextMenuItem[], submenuReference: HTMLElement) => (
      <ContextMenu
        referenceElement={submenuReference}
        items={submenuItems}
        onClose={onClose}
        isSubmenu={true}
      />
    ),
    [onClose]
  );

  return (
    <ContextMenuView
      setFloating={controller.setFloating}
      floatingStyles={controller.floatingStyles}
      items={items}
      className={className}
      title={title}
      activeSubmenuIndex={controller.activeSubmenuIndex}
      submenuReference={controller.submenuReference}
      onItemMouseEnter={controller.handleMouseEnter}
      onItemClick={handleItemClick}
      renderSubmenu={renderSubmenu}
    />
  );
};

export type { ContextMenuItem } from "@/models/game/context-menu/menu";
