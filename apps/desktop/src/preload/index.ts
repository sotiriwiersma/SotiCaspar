import { contextBridge, ipcRenderer } from 'electron';
import type { BackendApi, BackendEvents } from '@soticaspar/core';
import type { MenuAction, MenuState } from '../shared/commands';
import { BACKEND_METHODS, channels, type BackendEventEnvelope } from '../shared/ipc';
import type { ShellApi } from '../shared/shell';

type Listener = (payload: never) => void;
const listeners = new Map<keyof BackendEvents, Set<Listener>>();

ipcRenderer.on(channels.event, (_event, batch: BackendEventEnvelope[]) => {
  for (const { event, payload } of batch) {
    listeners.get(event)?.forEach((listener) => (listener as (p: unknown) => void)(payload));
  }
});

const methods = Object.fromEntries(
  BACKEND_METHODS.map((method) => [method, (...args: unknown[]) => ipcRenderer.invoke(channels.invoke(method), ...args)])
) as Omit<BackendApi, 'on'>;

const backend: BackendApi = {
  ...methods,
  on(event, listener) {
    let set = listeners.get(event);
    if (!set) listeners.set(event, (set = new Set()));
    set.add(listener as Listener);
    return () => {
      set.delete(listener as Listener);
    };
  }
};

let closeHandler: (() => Promise<boolean>) | null = null;
ipcRenderer.on(channels.beforeClose, async () => {
  const allow = closeHandler ? await closeHandler().catch(() => true) : true;
  ipcRenderer.send(channels.beforeCloseReply, allow);
});

const shell: ShellApi = {
  appInfo: () => ipcRenderer.invoke(channels.appInfo),
  onMenuAction(listener) {
    const handler = (_event: unknown, action: MenuAction): void => listener(action);
    ipcRenderer.on(channels.menuAction, handler);
    return () => ipcRenderer.removeListener(channels.menuAction, handler);
  },
  setMenuState: (state: MenuState) => ipcRenderer.send(channels.menuState, state),
  onBeforeClose(handler) {
    closeHandler = handler;
    return () => {
      if (closeHandler === handler) closeHandler = null;
    };
  },
  pickFile: (options) => ipcRenderer.invoke(channels.pickFile, options),
  readFile: (path) => ipcRenderer.invoke(channels.readFile, path),
  saveFile: (path, content, options) => ipcRenderer.invoke(channels.saveFile, path, content, options),
  fetchText: (url) => ipcRenderer.invoke(channels.fetchText, url),
  setTitle: (title) => ipcRenderer.send(channels.setTitle, title),
  toggleFullscreen: () => ipcRenderer.send(channels.toggleFullscreen),
  openLink: (url) => ipcRenderer.send(channels.openLink, url)
};

contextBridge.exposeInMainWorld('backend', backend);
contextBridge.exposeInMainWorld('shell', shell);
