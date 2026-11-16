import type { PlayoutType } from '@soticaspar/core';
import type { CommandId, MenuAction, MenuState } from '../../shared/commands';
import { shell } from '../lib/shell';
import { app } from './app.svelte';
import { library } from './library.svelte';
import { ui } from './ui.svelte';
import { workspace } from './workspace.svelte';

const PLAYOUT: Partial<Record<CommandId, PlayoutType>> = {
  'playout.stop': 'Stop',
  'playout.play': 'Play',
  'playout.playNow': 'PlayNow',
  'playout.load': 'Load',
  'playout.pause': 'PauseResume',
  'playout.next': 'Next',
  'playout.update': 'Update',
  'playout.invoke': 'Invoke',
  'playout.preview': 'Preview',
  'playout.clear': 'Clear',
  'playout.clearVideoLayer': 'ClearVideoLayer',
  'playout.clearChannel': 'ClearChannel'
};

const PANEL_SETTINGS = {
  'view.audioLevels': 'showAudioLevelsPanel',
  'view.preview': 'showPreviewPanel',
  'view.live': 'showLivePanel',
  'view.duration': 'showDurationPanel'
} as const;

/** Executes a menu / shortcut command. */
export function runCommand(action: MenuAction): void {
  const id = action.id;
  const playout = PLAYOUT[id as CommandId];
  if (playout) return workspace.trigger(playout);

  switch (id) {
    case 'file.new': return workspace.newRundown();
    case 'file.open': return void workspace.openDialog();
    case 'file.openRecent': return void (action.arg && workspace.openPath(action.arg));
    case 'file.openUrl': return ui.open('openUrl');
    case 'file.save': return void workspace.save(false);
    case 'file.saveAs': return void workspace.save(true);
    case 'file.saveAsPreset': return void workspace.saveSelectionAsPreset();
    case 'file.importPreset': return void library.importPreset();
    case 'file.exportPreset': return void library.exportSelectedPreset();
    case 'file.quit': return void window.close();
    case 'edit.settings': return ui.open('settings');
    case 'view.fullscreen': return shell.toggleFullscreen();
    case 'view.compact': return workspace.toggleCompact();
    case 'view.audioLevels':
    case 'view.preview':
    case 'view.live':
    case 'view.duration': {
      const key = PANEL_SETTINGS[id];
      return void app.updateSettings({ [key]: !app.settings[key] });
    }
    case 'library.refresh': return void app.refreshLibrary();
    case 'rundown.markUsed': return workspace.setUsed(true);
    case 'rundown.markUnused': return workspace.setUsed(false);
    case 'rundown.markAllUsed': return workspace.setAllUsed(true);
    case 'rundown.markAllUnused': return workspace.setAllUsed(false);
    case 'rundown.copyProps': return void workspace.copyProperties();
    case 'rundown.pasteProps': return void workspace.pasteProperties();
    case 'rundown.allowRemote': return workspace.setAllowRemote(!workspace.allowRemote);
    case 'rundown.insertRepositoryChanges': return workspace.insertRepositoryChanges();
    case 'rundown.reload': return void workspace.reload();
    case 'rundown.close': return void workspace.close();
    case 'help.view': return ui.open('help');
    case 'help.about': return ui.open('about');
  }
}

/** Which commands are unavailable / checked right now, mirrored to the native menu. */
export function menuState(): MenuState {
  const disabled: CommandId[] = [];
  const checked: CommandId[] = [];

  if (!workspace.canAddTab) disabled.push('file.new', 'file.open', 'file.openUrl');
  if (!workspace.hasContent) disabled.push('file.save', 'file.saveAs');
  if (workspace.selected.size === 0) disabled.push('file.saveAsPreset');
  if (library.selectedPreset === null) disabled.push('file.exportPreset');
  if (!workspace.active.model.path) disabled.push('rundown.reload');
  if (workspace.tabs.length <= 1) disabled.push('rundown.close');
  // Repository rundowns belong to the repository server (RundownWidget::repositoryRundown).
  if (workspace.repository) disabled.push('file.save', 'file.saveAs', 'rundown.allowRemote');
  else disabled.push('rundown.insertRepositoryChanges');

  if (workspace.compact) checked.push('view.compact');
  if (workspace.allowRemote) checked.push('rundown.allowRemote');
  for (const [command, setting] of Object.entries(PANEL_SETTINGS)) {
    if (app.settings[setting]) checked.push(command as CommandId);
  }
  return { disabled, checked, recent: app.recent };
}
