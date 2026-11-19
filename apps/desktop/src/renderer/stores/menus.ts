import { COMMANDS, type CommandId, type MenuEntry } from '../../shared/commands';
import { isGroupNode } from '../engine/tree';
import { COLORIZE_PALETTE, RESET_COLOR } from '../lib/colors';
import { toolCategories } from '../lib/definitions';
import { displayAccelerator } from '../lib/keymap';
import { SEPARATOR, type MenuItem } from '../lib/menu';
import { app } from './app.svelte';
import { menuState, runCommand } from './commands';
import { ui } from './ui.svelte';
import { workspace } from './workspace.svelte';

/** The context menu of the rundown list (RundownTreeWidget::setupMenus / customContextMenuRequested). */
export function buildRundownMenu(): MenuItem[] {
  const model = workspace.active.model;
  const selected = model.selectedNodes();
  const hasSelection = selected.length > 0;
  const onlyTopLevel = selected.every((n) => !model.parentOf(n.id));
  const anyGroup = selected.some(isGroupNode);
  const anyInGroup = selected.some((n) => model.parentOf(n.id) !== null);
  const currentColor = selected.length === 1 ? String(selected[0].props.color ?? RESET_COLOR) : null;
  // A repository rundown's structure belongs to the repository server (RundownTreeWidget::customContextMenuRequested).
  const locked = model.repository;

  const undo = workspace.undoLabel;
  const redo = workspace.redoLabel;

  return [
    { label: undo ? `Undo ${undo}` : 'Undo', shortcut: displayAccelerator('edit.undo'), disabled: !workspace.canUndo, onselect: () => workspace.undo() },
    { label: redo ? `Redo ${redo}` : 'Redo', shortcut: displayAccelerator('edit.redo'), disabled: !workspace.canRedo, onselect: () => workspace.redo() },
    SEPARATOR,
    {
      label: 'Tools',
      disabled: locked,
      children: toolCategories().map((category) => ({
        label: category.title,
        children: category.definitions.map((definition) => ({ label: definition.title, onselect: () => workspace.addTool(definition.type) }))
      }))
    },
    SEPARATOR,
    { label: 'Group', disabled: locked || !hasSelection || !onlyTopLevel || anyGroup || !model.canGroup(), onselect: () => workspace.group() },
    { label: 'Ungroup', disabled: locked || !hasSelection || (!anyGroup && !anyInGroup), onselect: () => workspace.ungroup() },
    SEPARATOR,
    {
      label: 'Mark Item',
      disabled: !hasSelection,
      children: [
        { label: 'As Used', onselect: () => workspace.setUsed(true) },
        { label: 'As Unused', onselect: () => workspace.setUsed(false) },
        { label: 'All as Used', onselect: () => workspace.setAllUsed(true) },
        { label: 'All as Unused', onselect: () => workspace.setAllUsed(false) }
      ]
    },
    SEPARATOR,
    { label: 'Copy Properties', disabled: !hasSelection, onselect: () => void workspace.copyProperties() },
    { label: 'Paste Properties', disabled: locked || !hasSelection, onselect: () => void workspace.pasteProperties() },
    SEPARATOR,
    {
      label: 'Colorize Item',
      disabled: locked || !hasSelection,
      children: [
        ...COLORIZE_PALETTE.map((color) => ({ label: color.name, checked: currentColor === color.value, onselect: () => workspace.colorize(color.value) })),
        ...(app.settings.customColors.length > 0 ? [SEPARATOR] : []),
        ...app.settings.customColors.map((color) => ({ label: color.name, checked: currentColor === color.value, onselect: () => workspace.colorize(color.value) })),
        SEPARATOR,
        { label: 'Custom Color...', onselect: () => ui.open('customColor') },
        {
          label: 'Remove Custom Color',
          disabled: app.settings.customColors.length === 0,
          children: app.settings.customColors.map((color) => ({
            label: color.name,
            onselect: () => void app.updateSettings({ customColors: app.settings.customColors.filter((c) => c.name !== color.name) })
          }))
        },
        SEPARATOR,
        { label: 'Reset', onselect: () => workspace.colorize(RESET_COLOR) }
      ]
    },
    SEPARATOR,
    { label: 'Save as Preset...', disabled: locked || !hasSelection, onselect: () => void workspace.saveSelectionAsPreset() },
    SEPARATOR,
    { label: 'Remove', disabled: locked || !hasSelection, onselect: () => workspace.remove() }
  ];
}

/** Menu items for the shared command table (in-app menu bar and the rundown dropdown). */
export function commandMenu(entries: readonly MenuEntry[]): MenuItem[] {
  const state = menuState();
  const command = (id: CommandId): MenuItem => ({
    label: COMMANDS[id].label,
    shortcut: displayAccelerator(id),
    checked: COMMANDS[id].checkbox ? state.checked.includes(id) : undefined,
    disabled: state.disabled.includes(id),
    onselect: () => runCommand({ id })
  });

  return entries.map((entry): MenuItem => {
    switch (entry.kind) {
      case 'command':
        return command(entry.id);
      case 'separator':
        return SEPARATOR;
      case 'submenu':
        return { label: entry.label, children: commandMenu(entry.entries) };
      case 'recent':
        return {
          label: 'Open Recent Rundown',
          disabled: app.recent.length === 0 || !workspace.canAddTab,
          children: app.recent.map((path) => ({ label: path, onselect: () => runCommand({ id: 'file.openRecent', arg: path }) }))
        };
    }
  });
}

const cmd = (id: CommandId): MenuEntry => ({ kind: 'command', id });
const sep: MenuEntry = { kind: 'separator' };

const DROPDOWN: readonly MenuEntry[] = [
  cmd('file.new'), cmd('file.open'), cmd('file.openUrl'), sep,
  { kind: 'recent' }, sep,
  cmd('file.save'), cmd('file.saveAs'), sep,
  { kind: 'submenu', label: 'Mark Item', entries: [cmd('rundown.markUsed'), cmd('rundown.markUnused'), cmd('rundown.markAllUsed'), cmd('rundown.markAllUnused')] },
  sep,
  cmd('rundown.copyProps'), cmd('rundown.pasteProps'), sep,
  cmd('view.compact'), cmd('rundown.allowRemote'), sep,
  cmd('rundown.insertRepositoryChanges'), sep,
  cmd('rundown.reload'), sep,
  cmd('rundown.close')
];

/** The dropdown at the corner of the rundown tab bar. */
export const rundownDropdown = (): MenuItem[] => commandMenu(DROPDOWN);
