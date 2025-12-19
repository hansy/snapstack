import React from "react";
import {
  autoUpdate,
  flip,
  offset,
  shift,
  useFloating,
  type VirtualElement,
} from "@floating-ui/react";

import type { ContextMenuItem } from "@/models/game/context-menu/menu";

export type ContextMenuControllerInput = {
  x?: number;
  y?: number;
  referenceElement?: HTMLElement | VirtualElement | null;
  items: ContextMenuItem[];
  onClose: () => void;
  isSubmenu: boolean;
};

export const useContextMenuController = ({
  x,
  y,
  referenceElement,
  items,
  onClose,
  isSubmenu,
}: ContextMenuControllerInput) => {
  const menuRef = React.useRef<HTMLDivElement>(null);
  const [activeSubmenuIndex, setActiveSubmenuIndex] = React.useState<number | null>(null);
  const [submenuReference, setSubmenuReference] = React.useState<HTMLElement | null>(null);

  const anchorVirtualElement = React.useMemo<VirtualElement | null>(() => {
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
    placement: isSubmenu ? "right-start" : "bottom-start",
    strategy: "fixed",
    middleware: [
      offset(isSubmenu ? { mainAxis: 4, alignmentAxis: -8 } : 6),
      flip({ fallbackAxisSideDirection: "start" }),
      shift({ padding: 8 }),
    ],
    whileElementsMounted: autoUpdate,
  });

  const setFloating = React.useCallback(
    (node: HTMLDivElement | null) => {
      menuRef.current = node;
      refs.setFloating(node);
    },
    [refs]
  );

  React.useEffect(() => {
    if (referenceElement) {
      refs.setReference(referenceElement);
    } else if (anchorVirtualElement) {
      // Virtual references must be set via setPositionReference.
      refs.setPositionReference(anchorVirtualElement);
    }
  }, [referenceElement, anchorVirtualElement, refs]);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;

      // If clicking inside any context menu (root or submenu), ignore
      const anyMenuContains = Array.from(
        document.querySelectorAll("[data-context-menu-root]")
      ).some((el) => el.contains(target));
      if (anyMenuContains) return;

      if (!isSubmenu) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onClose, isSubmenu]);

  const handleMouseEnter = React.useCallback(
    (index: number, e: React.MouseEvent<HTMLButtonElement>) => {
      const item = items[index];
      if (item?.type === "action" && item.submenu) {
        setActiveSubmenuIndex(index);
        setSubmenuReference(e.currentTarget);
      } else {
        setActiveSubmenuIndex(null);
        setSubmenuReference(null);
      }
    },
    [items]
  );

  return {
    setFloating,
    floatingStyles,
    activeSubmenuIndex,
    submenuReference,
    handleMouseEnter,
  };
};

export type ContextMenuController = ReturnType<typeof useContextMenuController>;
