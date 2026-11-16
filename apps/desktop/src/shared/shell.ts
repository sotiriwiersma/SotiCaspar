import type { BackendApi } from '@soticaspar/core';
import type { MenuAction, MenuState } from './commands';

/** Menu actions, dialogs and file IO that only the Electron main process can do (`window.shell`). */

export interface RundownFile {
  path: string;
  content: string;
}

export interface FileFilter {
  name: string;
  extensions: string[];
}

export interface AppInfo {
  name: string;
  version: string;
  electron: string;
  platform: string;
  /** True when the OS menu registers the accelerators itself (macOS), so the renderer must not. */
  menuHandlesAccelerators: boolean;
}

export interface SaveOptions {
  title?: string;
  defaultPath?: string;
  filters?: FileFilter[];
}

export interface PickOptions {
  title?: string;
  defaultPath?: string;
  filters?: FileFilter[];
}

export interface ShellApi {
  appInfo(): Promise<AppInfo>;
  onMenuAction(listener: (action: MenuAction) => void): () => void;
  setMenuState(state: MenuState): void;
  /** Registers the handler asked before the window closes; resolve `true` to allow closing. */
  onBeforeClose(handler: () => Promise<boolean>): () => void;
  /** Shows an open dialog and returns the chosen file with its UTF-8 content, or null when cancelled. */
  pickFile(options?: PickOptions): Promise<RundownFile | null>;
  readFile(path: string): Promise<string>;
  /** Writes `content` to `path`, or asks for a location when `path` is null. Resolves the final path or null when cancelled. */
  saveFile(path: string | null, content: string, options?: SaveOptions): Promise<string | null>;
  fetchText(url: string): Promise<string>;
  setTitle(title: string): void;
  toggleFullscreen(): void;
}

declare global {
  interface Window {
    backend?: BackendApi;
    shell?: ShellApi;
  }
}
