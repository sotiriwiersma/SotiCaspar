import { app, BrowserWindow, Menu, type MenuItemConstructorOptions } from 'electron';
import { COMMANDS, MENU, type CommandId, type MenuAction, type MenuEntry, type MenuState } from '../shared/commands';
import { channels } from '../shared/ipc';

const isMac = process.platform === 'darwin';

function toTemplate(entries: readonly MenuEntry[], state: MenuState, send: (action: MenuAction) => void): MenuItemConstructorOptions[] {
  return entries.map((entry): MenuItemConstructorOptions => {
    switch (entry.kind) {
      case 'separator':
        return { type: 'separator' };
      case 'submenu':
        return { label: entry.label, submenu: toTemplate(entry.entries, state, send) };
      case 'recent':
        return {
          label: 'Open Recent Rundown',
          enabled: state.recent.length > 0,
          submenu: state.recent.map((path) => ({ label: path, click: () => send({ id: 'file.openRecent', arg: path }) }))
        };
      case 'command': {
        const info = COMMANDS[entry.id as CommandId];
        return {
          label: info.label,
          accelerator: info.accelerator,
          // The renderer handles the keys itself so shortcuts like Shift+C do not swallow typing in text fields.
          registerAccelerator: isMac,
          type: info.checkbox ? 'checkbox' : 'normal',
          checked: info.checkbox ? state.checked.includes(entry.id) : undefined,
          enabled: !state.disabled.includes(entry.id),
          click: () => send({ id: entry.id })
        };
      }
    }
  });
}

/** Builds the application menu from the shared command table (File, Edit, View, Library, Rundown, Playout, Help). */
export function applyMenu(window: BrowserWindow, state: MenuState): void {
  const send = (action: MenuAction): void => {
    if (!window.isDestroyed()) window.webContents.send(channels.menuAction, action);
  };
  const template: MenuItemConstructorOptions[] = MENU.map((menu) => {
    const submenu = toTemplate(menu.entries, state, send);
    if (menu.label === 'View' && !app.isPackaged) {
      submenu.push({ type: 'separator' }, { role: 'toggleDevTools' }, { role: 'reload' });
    }
    return { label: menu.label, submenu };
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
