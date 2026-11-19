import {
  createItem,
  getItemDefinition,
  listItemDefinitions,
  ROW_COLORS,
  type AnyItemDefinition,
  type AppSettings,
  type ItemCategory,
  type LibraryEntry,
  type LibraryType,
  type RundownItem
} from '@soticaspar/core';
import { isGroupNode, type TreeNode } from '../engine/tree';

export const GROUP_TYPE = 'GROUP';

/** The library type that provides the media of an item type (target suggestions, thumbnails). */
export const LIBRARY_TYPE_OF_ITEM: Readonly<Record<string, LibraryType>> = { MOVIE: 'MOVIE', AUDIO: 'AUDIO', STILL: 'STILL', IMAGESCROLLER: 'STILL', TEMPLATE: 'TEMPLATE' };

/** Rundown::DEFAULT_ITEM_HEIGHT / COMPACT_ITEM_HEIGHT */
export const ROW_HEIGHT = 36;
export const COMPACT_ROW_HEIGHT = 21;

/** Library media type to the rundown item type created from it. */
export const ITEM_TYPE_OF_LIBRARY: Readonly<Record<Exclude<LibraryType, 'DATA'>, string>> = {
  MOVIE: 'MOVIE',
  AUDIO: 'AUDIO',
  STILL: 'STILL',
  TEMPLATE: 'TEMPLATE'
};

export const CATEGORY_TITLES: Readonly<Record<ItemCategory, string>> = {
  producer: 'Producers',
  mixer: 'Mixer',
  control: 'Control',
  output: 'Output',
  layout: 'Layout'
};

const CATEGORY_ORDER: readonly ItemCategory[] = ['producer', 'mixer', 'control', 'output', 'layout'];

export interface ToolCategory {
  category: ItemCategory;
  title: string;
  definitions: AnyItemDefinition[];
}

/** The Tools tree of the library: every registered item type except groups, by category. */
export function toolCategories(): ToolCategory[] {
  const definitions = listItemDefinitions().filter((d) => d.type !== GROUP_TYPE);
  return CATEGORY_ORDER.map((category) => ({
    category,
    title: CATEGORY_TITLES[category],
    definitions: definitions.filter((d) => d.category === category).sort((a, b) => a.title.localeCompare(b.title))
  })).filter((c) => c.definitions.length > 0);
}

/** Title of the item type for the row's second line / inspector header. */
export const typeTitle = (type: string): string => (type === GROUP_TYPE ? 'Group' : (getItemDefinition(type)?.title ?? type));

/** Colour of the type bar of a row. */
export function typeColor(type: string): string {
  if (type === GROUP_TYPE) return ROW_COLORS.group;
  return getItemDefinition(type)?.color ?? ROW_COLORS.transparent;
}

/** Row label: the last path segment of the label, like the Qt rows (`FOLDER/CLIP` shows `CLIP`). */
export function rowLabel(node: TreeNode): string {
  if (isGroupNode(node)) return node.label;
  return node.label.split('/').pop() ?? node.label;
}

/** The item types of the library clips that have default properties (Settings, New clips). */
export const CLIP_TYPES: readonly string[] = ['MOVIE', 'STILL', 'AUDIO', 'TEMPLATE'];

/**
 * New items start with the defaults of the settings: video items follow `Use freeze on load` (set when the Qt
 * widget is created), and every clip type with its own defaults (`clipDefaults`) takes those on top.
 */
export function applyItemDefaults(item: RundownItem, settings: Pick<AppSettings, 'useFreezeOnLoad' | 'clipDefaults'>): RundownItem {
  const own = settings.clipDefaults[item.type];
  const freeze = settings.useFreezeOnLoad && LIBRARY_TYPE_OF_ITEM[item.type] === 'MOVIE' ? { freezeonload: true } : undefined;
  if (!own && !freeze) return item;
  // The duration of the media is the item's own, never a default.
  const { timecode: _timecode, ...defaults } = own ?? {};
  return { ...item, props: { ...item.props, ...freeze, ...defaults } };
}

export const SEPARATOR_TYPE = 'SEPARATOR';

/** Row text: separators only show a label of their own, never their type name ("Separator"). */
export function rowTitle(node: TreeNode): { label: string; type: string } {
  const label = rowLabel(node);
  const title = typeTitle(node.type);
  if (node.type === SEPARATOR_TYPE) return { label: label === title ? '' : label, type: '' };
  return { label, type: title !== label ? title : '' };
}

export function createToolItem(type: string): RundownItem | null {
  const definition = getItemDefinition(type);
  // A separator starts without text: it is a colored bar until the user gives it a label.
  return definition ? createItem(type, { label: type === SEPARATOR_TYPE ? '' : definition.title }) : null;
}

/** Item for a library entry (double click or drag from the Audio/Image/Template/Video tabs). */
export function createLibraryItem(entry: LibraryEntry, asType?: string): RundownItem | null {
  if (entry.type === 'DATA') return null;
  const type = asType ?? ITEM_TYPE_OF_LIBRARY[entry.type];
  if (!getItemDefinition(type)) return null;
  return createItem(type, { name: entry.name, label: entry.name, deviceName: entry.deviceName, props: { timecode: entry.timecode } });
}

export interface LibraryDragItem {
  entryId: string;
  asType?: string;
}

export const MIME = {
  libraryItems: 'application/x-soticaspar-library',
  toolItem: 'application/x-soticaspar-tool',
  preset: 'application/x-soticaspar-preset',
  rundownItems: 'application/x-soticaspar-rundown'
} as const;
