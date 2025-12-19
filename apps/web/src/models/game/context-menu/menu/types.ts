export type ContextMenuItem = ContextMenuAction | ContextMenuSeparator;

export interface ContextMenuAction {
  type: "action";
  label: string;
  onSelect: () => void;
  danger?: boolean;
  submenu?: ContextMenuItem[];
  disabledReason?: string;
  shortcut?: string;
  checked?: boolean;
}

export interface ContextMenuSeparator {
  type: "separator";
  id?: string;
}

