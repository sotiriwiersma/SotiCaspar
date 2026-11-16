import { app, BrowserWindow, Menu, type MenuItem, type MenuItemConstructorOptions } from 'electron';
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
          id: entry.id,
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

/** Every item of a menu, submenus included. */
function* allItems(menu: Menu): Generator<MenuItem> {
  for (const item of menu.items) {
    yield item;
    if (item.submenu) yield* allItems(item.submenu);
  }
}

let built: { window: BrowserWindow; recent: string } | undefined;

/**
 * Brings the application menu in line with `state`. On Windows the menu bar is part of the window frame and
 * replacing the menu resets it: an open menu closes and moving the mouse to the next one stops working. So only
 * a change of its structure (the Open Recent list) rebuilds it; enabled and checked states are changed in place.
 */
export function applyMenu(window: BrowserWindow, state: MenuState): void {
  const recent = JSON.stringify(state.recent);
  const menu = Menu.getApplicationMenu();
  if (menu && built?.window === window && built.recent === recent) {
    for (const item of allItems(menu)) {
      const id = item.id as CommandId;
      if (!(id in COMMANDS)) continue;
      const enabled = !state.disabled.includes(id);
      if (item.enabled !== enabled) item.enabled = enabled;
      if (COMMANDS[id].checkbox) {
        const checked = state.checked.includes(id);
        if (item.checked !== checked) item.checked = checked;
      }
    }
    return;
  }
  built = { window, recent };
  buildMenu(window, state);
}

/** Builds the application menu from the shared command table (File, Edit, View, Library, Rundown, Playout, Help). */
function buildMenu(window: BrowserWindow, state: MenuState): void {
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
