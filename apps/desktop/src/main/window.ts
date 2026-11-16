import { app, BrowserWindow, screen } from 'electron';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

interface WindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
  maximized: boolean;
}

const DEFAULT_STATE: WindowState = { width: 1440, height: 900, maximized: false };
const stateFile = (): string => join(app.getPath('userData'), 'window-state.json');

/** Whether a remembered window rectangle is still on a connected display. */
function isVisible(state: WindowState): boolean {
  if (state.x === undefined || state.y === undefined) return true;
  const { x, y, width, height } = state as Required<WindowState>;
  return screen.getAllDisplays().some(({ workArea: b }) => x < b.x + b.width && x + width > b.x && y < b.y + b.height && y + height > b.y);
}

function loadState(): WindowState {
  try {
    if (!existsSync(stateFile())) return DEFAULT_STATE;
    const saved: WindowState = { ...DEFAULT_STATE, ...(JSON.parse(readFileSync(stateFile(), 'utf8')) as Partial<WindowState>) };
    return isVisible(saved) ? saved : { ...saved, x: undefined, y: undefined };
  } catch {
    return DEFAULT_STATE;
  }
}

/** Creates the main window, restoring and persisting its size and position. */
export function createMainWindow(options: { preload: string }): BrowserWindow {
  const state = loadState();
  const window = new BrowserWindow({
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
    minWidth: 960,
    minHeight: 600,
    show: false,
    backgroundColor: '#2d2d2d',
    title: 'SotiCaspar',
    webPreferences: {
      preload: options.preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Delays, durations, auto-step and the live stream run in the renderer and must keep time while the
      // window is covered or minimised; Chromium otherwise throttles (or freezes) its timers.
      backgroundThrottling: false
    }
  });

  if (state.maximized) window.maximize();
  window.once('ready-to-show', () => window.show());

  // While maximized or fullscreen the "normal" bounds are kept so restoring returns to them.
  let normal = window.getBounds();
  const save = (): void => {
    try {
      writeFileSync(stateFile(), JSON.stringify({ ...normal, maximized: window.isMaximized() }));
    } catch {
      // Remembering the window is a convenience only.
    }
  };
  const track = (): void => {
    if (!window.isMaximized() && !window.isFullScreen() && !window.isMinimized()) normal = window.getBounds();
  };

  let timer: NodeJS.Timeout | undefined;
  const saveSoon = (): void => {
    track();
    clearTimeout(timer);
    timer = setTimeout(save, 400);
  };
  window.on('resize', saveSoon);
  window.on('move', saveSoon);
  window.on('maximize', saveSoon);
  window.on('unmaximize', saveSoon);
  window.on('close', save);

  return window;
}
