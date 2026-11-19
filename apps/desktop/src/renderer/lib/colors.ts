import { ROW_COLORS } from '@soticaspar/core';

/** The "Colorize Item" palette of the rundown context menu (RundownTreeWidget::colorLookup). */
export const COLORIZE_PALETTE: ReadonlyArray<{ name: string; value: string }> = [
  { name: 'Chocolate', value: 'rgba(123, 63, 0, 128)' },
  { name: 'DarkKhaki', value: 'rgba(189, 183, 107, 64)' },
  { name: 'DarkSlateGray', value: 'rgba(47, 79, 79, 128)' },
  { name: 'Maroon', value: 'rgba(128, 0, 0, 192)' },
  { name: 'MaroonLight', value: 'rgba(128, 0, 0, 64)' },
  { name: 'OliveDrab', value: 'rgba(107, 142, 35, 128)' },
  { name: 'RoyalBlue', value: 'rgba(65, 105, 225, 64)' },
  { name: 'SeaGreen', value: 'rgba(46, 139, 87, 128)' },
  { name: 'Sienna', value: 'rgba(136, 45, 23, 128)' },
  { name: 'SteelBlue', value: 'rgba(70, 130, 179, 128)' }
];

export const RESET_COLOR = ROW_COLORS.transparent;

/** `#rrggbb` from the color picker to the rundown file format (opaque, like the palette shows). */
export function hexToRowColor(hex: string): string {
  const match = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!match) return RESET_COLOR;
  const [r, g, b] = match.slice(1).map((part) => Number.parseInt(part, 16));
  return `rgba(${r}, ${g}, ${b}, 255)`;
}

/** The `#rrggbb` of a row color in `rgba(r, g, b, a)` or `#rrggbb` form, for the color picker; black otherwise. */
export function rowColorToHex(color: string): string {
  if (/^#[0-9a-f]{6}$/i.test(color)) return color.toLowerCase();
  const match = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(color);
  if (!match) return '#000000';
  return `#${match.slice(1, 4).map((part) => Math.min(255, Number(part)).toString(16).padStart(2, '0')).join('')}`;
}

export const ACTIVE_COLOR = ROW_COLORS.active;

export const isTransparent = (color: unknown): boolean => color === undefined || color === '' || String(color).toLowerCase() === 'transparent';
