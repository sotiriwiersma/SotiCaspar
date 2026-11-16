export interface MenuItem {
  label?: string;
  separator?: boolean;
  disabled?: boolean;
  checked?: boolean;
  shortcut?: string;
  onselect?: () => void;
  children?: MenuItem[];
}

export const SEPARATOR: MenuItem = { separator: true };
