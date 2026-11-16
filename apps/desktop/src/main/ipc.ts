import { app, BrowserWindow, ipcMain, shell } from 'electron';
import type { BackendApi, BackendEvents } from '@soticaspar/core';
import type { MenuState } from '../shared/commands';
import { BACKEND_EVENTS, BACKEND_METHODS, channels, type BackendEventEnvelope } from '../shared/ipc';
import { OPEN_LINKS, type PickOptions, type SaveOptions } from '../shared/shell';
import { fetchText, pickFile, readTextFile, saveFile } from './files';
import { applyMenu } from './menu';

type Backend = BackendApi & { dispose?(): Promise<void> | void };

const FLUSH_MS = 8;

/** Bridges every `BackendApi` method and event to the renderer and serves the shell API (menu, dialogs, files). */
export function registerIpc(backend: Backend, getWindow: () => BrowserWindow | null): () => void {
  for (const method of BACKEND_METHODS) {
    ipcMain.handle(channels.invoke(method), (_event, ...args: unknown[]) => (backend[method] as (...a: unknown[]) => unknown)(...args));
  }

  // Events (OSC in particular) are sent in small batches instead of one IPC message each.
  let queue: BackendEventEnvelope[] = [];
  let timer: NodeJS.Timeout | undefined;
  const flush = (): void => {
    timer = undefined;
    const batch = queue;
    queue = [];
    const window = getWindow();
    if (window && !window.isDestroyed()) window.webContents.send(channels.event, batch);
  };
  const unsubscribers = BACKEND_EVENTS.map((event) =>
    backend.on(event, (payload: BackendEvents[typeof event]) => {
      queue.push({ event, payload } as BackendEventEnvelope);
      timer ??= setTimeout(flush, FLUSH_MS);
    })
  );

  ipcMain.handle(channels.appInfo, () => ({
    name: app.getName(),
    version: app.getVersion(),
    electron: process.versions.electron,
    platform: process.platform,
    menuHandlesAccelerators: process.platform === 'darwin'
  }));
  ipcMain.handle(channels.pickFile, (_e, options?: PickOptions) => pickFile(getWindow(), options));
  ipcMain.handle(channels.readFile, (_e, path: string) => readTextFile(path));
  ipcMain.handle(channels.saveFile, (_e, path: string | null, content: string, options?: SaveOptions) => saveFile(getWindow(), path, content, options));
  ipcMain.handle(channels.fetchText, (_e, url: string) => fetchText(url));
  ipcMain.on(channels.setTitle, (_e, title: string) => {
    // Setting the title repaints the frame, menu bar included: only do it for a real change.
    const window = getWindow();
    if (window && window.getTitle() !== title) window.setTitle(title);
  });
  ipcMain.on(channels.openLink, (_e, url: unknown) => {
    // Only the fixed project pages; never an address the page made up.
    if (typeof url === 'string' && (OPEN_LINKS as readonly string[]).includes(url)) void shell.openExternal(url);
  });
  ipcMain.on(channels.toggleFullscreen, () => {
    const window = getWindow();
    window?.setFullScreen(!window.isFullScreen());
  });

  let lastMenu = '';
  ipcMain.on(channels.menuState, (_e, state: MenuState) => {
    const window = getWindow();
    const serialized = JSON.stringify(state);
    if (!window || serialized === lastMenu) return;
    lastMenu = serialized;
    applyMenu(window, state);
  });

  return () => {
    clearTimeout(timer);
    for (const stop of unsubscribers) stop();
    for (const method of BACKEND_METHODS) ipcMain.removeHandler(channels.invoke(method));
    for (const channel of [channels.appInfo, channels.pickFile, channels.readFile, channels.saveFile, channels.fetchText]) ipcMain.removeHandler(channel);
    for (const channel of [channels.setTitle, channels.toggleFullscreen, channels.menuState, channels.openLink]) ipcMain.removeAllListeners(channel);
  };
}
