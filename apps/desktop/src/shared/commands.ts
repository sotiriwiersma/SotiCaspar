/** Menu / shortcut commands shared by the native menu (main), the keymap and the in-app menus (renderer). */

export type CommandId =
  | 'file.new'
  | 'file.open'
  | 'file.openUrl'
  | 'file.importPreset'
  | 'file.exportPreset'
  | 'file.saveAsPreset'
  | 'file.save'
  | 'file.saveAs'
  | 'file.quit'
  | 'edit.settings'
  | 'view.fullscreen'
  | 'view.compact'
  | 'view.audioLevels'
  | 'view.preview'
  | 'view.live'
  | 'view.countdown'
  | 'library.refresh'
  | 'rundown.markUsed'
  | 'rundown.markUnused'
  | 'rundown.markAllUsed'
  | 'rundown.markAllUnused'
  | 'rundown.copyProps'
  | 'rundown.pasteProps'
  | 'rundown.allowRemote'
  | 'rundown.insertRepositoryChanges'
  | 'rundown.reload'
  | 'rundown.close'
  | 'playout.stop'
  | 'playout.play'
  | 'playout.load'
  | 'playout.pause'
  | 'playout.next'
  | 'playout.update'
  | 'playout.invoke'
  | 'playout.preview'
  | 'playout.clear'
  | 'playout.clearVideoLayer'
  | 'playout.clearChannel'
  | 'playout.playNow'
  | 'help.view'
  | 'help.about';

export interface CommandInfo {
  label: string;
  /** Electron accelerator syntax. */
  accelerator?: string;
  checkbox?: boolean;
}

export const COMMANDS: Record<CommandId, CommandInfo> = {
  'file.new': { label: 'New Rundown', accelerator: 'CmdOrCtrl+N' },
  'file.open': { label: 'Open Rundown...', accelerator: 'CmdOrCtrl+O' },
  'file.openUrl': { label: 'Open Rundown from Repository...', accelerator: 'CmdOrCtrl+Shift+O' },
  'file.importPreset': { label: 'Import Preset...' },
  'file.exportPreset': { label: 'Export Preset...' },
  'file.saveAsPreset': { label: 'Save as Preset...' },
  'file.save': { label: 'Save', accelerator: 'CmdOrCtrl+S' },
  'file.saveAs': { label: 'Save As...', accelerator: 'CmdOrCtrl+Shift+S' },
  'file.quit': { label: 'Quit' },
  'edit.settings': { label: 'Settings...' },
  'view.fullscreen': { label: 'Toggle Fullscreen', accelerator: 'CmdOrCtrl+F' },
  'view.compact': { label: 'Compact View', checkbox: true },
  'view.audioLevels': { label: 'Audio Levels Panel', checkbox: true },
  'view.preview': { label: 'Preview Panel', checkbox: true },
  'view.live': { label: 'Live Panel', checkbox: true },
  'view.countdown': { label: 'Countdown Bar', checkbox: true },
  'library.refresh': { label: 'Refresh Library', accelerator: 'CmdOrCtrl+R' },
  'rundown.markUsed': { label: 'As Used' },
  'rundown.markUnused': { label: 'As Unused' },
  'rundown.markAllUsed': { label: 'All as Used' },
  'rundown.markAllUnused': { label: 'All as Unused' },
  'rundown.copyProps': { label: 'Copy Item Properties', accelerator: 'Shift+C' },
  'rundown.pasteProps': { label: 'Paste Item Properties', accelerator: 'Shift+V' },
  'rundown.allowRemote': { label: 'Allow Remote Triggering', checkbox: true },
  'rundown.insertRepositoryChanges': { label: 'Insert Repository Changes', accelerator: 'Insert' },
  'rundown.reload': { label: 'Reload Rundown', accelerator: 'CmdOrCtrl+L' },
  'rundown.close': { label: 'Close Rundown', accelerator: 'CmdOrCtrl+W' },
  'playout.stop': { label: 'Stop', accelerator: 'F1' },
  'playout.play': { label: 'Play', accelerator: 'F2' },
  'playout.load': { label: 'Load', accelerator: 'F3' },
  'playout.pause': { label: 'Pause / Resume', accelerator: 'F4' },
  'playout.next': { label: 'Next', accelerator: 'F5' },
  'playout.update': { label: 'Update', accelerator: 'F6' },
  'playout.invoke': { label: 'Invoke', accelerator: 'F7' },
  'playout.preview': { label: 'Preview', accelerator: 'F8' },
  'playout.clear': { label: 'Clear', accelerator: 'F10' },
  'playout.clearVideoLayer': { label: 'Clear Video Layer', accelerator: 'F11' },
  'playout.clearChannel': { label: 'Clear Channel', accelerator: 'F12' },
  'playout.playNow': { label: 'Play Now', accelerator: 'Shift+F2' },
  'help.view': { label: 'View Help', accelerator: 'CmdOrCtrl+H' },
  'help.about': { label: 'About SotiCaspar...' }
};

export type MenuEntry =
  | { kind: 'command'; id: CommandId }
  | { kind: 'separator' }
  | { kind: 'recent' }
  | { kind: 'submenu'; label: string; entries: readonly MenuEntry[] };

const c = (id: CommandId): MenuEntry => ({ kind: 'command', id });
const SEP: MenuEntry = { kind: 'separator' };

/** Mirrors the menu bar of the Qt MainWindow (plus the panel toggles of the View menu). */
export const MENU: readonly { label: string; entries: readonly MenuEntry[] }[] = [
  {
    label: 'File',
    entries: [
      c('file.new'), c('file.open'), c('file.openUrl'), SEP,
      { kind: 'recent' }, SEP,
      c('file.importPreset'), c('file.exportPreset'), c('file.saveAsPreset'), SEP,
      c('file.save'), c('file.saveAs'), SEP,
      c('file.quit')
    ]
  },
  { label: 'Edit', entries: [c('edit.settings')] },
  {
    label: 'View',
    entries: [
      c('view.fullscreen'), SEP,
      c('view.compact'), SEP,
      c('view.audioLevels'), c('view.preview'), c('view.live'), c('view.countdown')
    ]
  },
  { label: 'Library', entries: [c('library.refresh')] },
  {
    label: 'Rundown',
    entries: [
      { kind: 'submenu', label: 'Mark Item', entries: [c('rundown.markUsed'), c('rundown.markUnused'), c('rundown.markAllUsed'), c('rundown.markAllUnused')] },
      SEP,
      c('rundown.copyProps'), c('rundown.pasteProps'), SEP,
      c('rundown.allowRemote'), SEP,
      c('rundown.insertRepositoryChanges'), SEP,
      c('rundown.reload'), SEP,
      c('rundown.close')
    ]
  },
  {
    label: 'Playout',
    entries: [
      c('playout.stop'), c('playout.play'), c('playout.load'), c('playout.pause'), SEP,
      c('playout.next'), c('playout.update'), c('playout.invoke'), c('playout.preview'), SEP,
      c('playout.clear'), c('playout.clearVideoLayer'), c('playout.clearChannel'), SEP,
      c('playout.playNow')
    ]
  },
  { label: 'Help', entries: [c('help.view'), SEP, c('help.about')] }
];

/** Menu state pushed from the renderer so the native menu can enable/check entries. */
export interface MenuState {
  disabled: CommandId[];
  checked: CommandId[];
  recent: string[];
}

export interface MenuAction {
  id: CommandId | 'file.openRecent' | 'file.clearRecent';
  arg?: string;
}
