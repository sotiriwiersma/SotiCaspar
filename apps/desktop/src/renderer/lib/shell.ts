import type { ShellApi } from '../../shared/shell';

/** Browser stand-in for the Electron shell: files go through <input>/download, everything else is a no-op. */
const browserShell: ShellApi = {
  appInfo: async () => ({ name: 'SotiCaspar', version: 'dev', electron: '', platform: 'web', menuHandlesAccelerators: false }),
  onMenuAction: () => () => undefined,
  setMenuState: () => undefined,
  onBeforeClose: (handler) => {
    const listener = (event: BeforeUnloadEvent): void => {
      void handler().then((allow) => allow || event.preventDefault());
      event.preventDefault();
    };
    window.addEventListener('beforeunload', listener);
    return () => window.removeEventListener('beforeunload', listener);
  },
  pickFile: (options) =>
    new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = (options?.filters ?? []).flatMap((f) => f.extensions.map((e) => `.${e}`)).join(',');
      input.onchange = async () => {
        const file = input.files?.[0];
        resolve(file ? { path: file.name, content: await file.text() } : null);
      };
      input.oncancel = () => resolve(null);
      input.click();
    }),
  readFile: () => Promise.reject(new Error('Reading files by path needs the desktop app')),
  saveFile: async (path, content, options) => {
    const name = path ?? options?.defaultPath ?? 'rundown.xml';
    const url = URL.createObjectURL(new Blob([content], { type: 'text/xml;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name.split(/[\\/]/).pop() ?? name;
    link.click();
    URL.revokeObjectURL(url);
    return name;
  },
  fetchText: async (url) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.text();
  },
  setTitle: (title) => {
    document.title = title;
  },
  toggleFullscreen: () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen();
  },
  openLink: (url) => void window.open(url, '_blank', 'noopener')
};

export const shell: ShellApi = (typeof window !== 'undefined' && window.shell) || browserShell;
export const hasNativeShell = typeof window !== 'undefined' && window.shell !== undefined;
