import { app, BrowserWindow, ipcMain, session } from 'electron';
import { join } from 'node:path';
import { createBackend } from '@soticaspar/backend';
import type { BackendApi } from '@soticaspar/core';
import { MockBackend } from '../shared/mockBackend';
import { channels } from '../shared/ipc';
import { registerIpc } from './ipc';
import { createMainWindow } from './window';

type Backend = BackendApi & { dispose?(): Promise<void> | void };

const log = (level: string, message: string): void => {
  if (level !== 'debug') console[level === 'error' ? 'error' : 'log'](`[backend:${level}] ${message}`);
};

/** The real backend; `SOTICASPAR_MOCK=1` (or a failing backend) uses the in-memory mock so the UI stays usable. */
function startBackend(): Backend {
  if (process.env['SOTICASPAR_MOCK'] === '1') return new MockBackend();
  try {
    return createBackend({ dataDir: join(app.getPath('userData'), 'data'), log });
  } catch (error) {
    console.error('Could not start the backend, using the mock backend instead:', error);
    return new MockBackend();
  }
}

let window: BrowserWindow | null = null;
let backend: Backend | null = null;
let closeApproved = false;

app.setName('SotiCaspar');

// A separate settings folder, and with it a separate single-instance lock: lets a second copy run, e.g. for testing.
const userDataDir = process.env['SOTICASPAR_USER_DATA'];
if (userDataDir) app.setPath('userData', userDataDir);

/** Asks the renderer whether closing is fine (unsaved rundowns) before the window goes away. */
function guardClose(target: BrowserWindow): void {
  target.on('close', (event) => {
    if (closeApproved) return;
    event.preventDefault();
    target.webContents.send(channels.beforeClose);
  });
  ipcMain.on(channels.beforeCloseReply, (_e, allow: boolean) => {
    if (!allow || target.isDestroyed()) return;
    closeApproved = true;
    target.close();
  });
}

async function createWindow(): Promise<void> {
  const target = createMainWindow({ preload: join(import.meta.dirname, '../preload/index.cjs') });
  window = target;
  guardClose(target);
  target.on('closed', () => (window = null));
  target.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  target.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(devUrl ?? 'file://')) event.preventDefault();
  });
  if (devUrl) await target.loadURL(devUrl);
  else await target.loadFile(join(import.meta.dirname, '../renderer/index.html'));

  if (backend && (await backend.getSettings()).startFullscreen) target.setFullScreen(true);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.focus();
  });

  app.whenReady().then(async () => {
    // The clipboard is needed for copy/paste of rundown items; everything else stays denied.
    session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => callback(permission === 'clipboard-read' || permission === 'clipboard-sanitized-write'));

    backend = startBackend();
    registerIpc(backend, () => window);
    await createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        closeApproved = false;
        void createWindow();
      }
    });
  });

  app.on('window-all-closed', () => {
    app.quit();
  });

  let disposed = false;
  app.on('before-quit', (event) => {
    if (disposed || !backend) return;
    event.preventDefault();
    disposed = true;
    void Promise.resolve(backend.dispose?.()).finally(() => app.quit());
  });
}
