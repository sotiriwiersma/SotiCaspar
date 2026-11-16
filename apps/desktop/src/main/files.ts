import { BrowserWindow, dialog, net } from 'electron';
import { readFile, writeFile } from 'node:fs/promises';
import { extname } from 'node:path';
import type { FileFilter, PickOptions, RundownFile, SaveOptions } from '../shared/shell';

const toElectronFilters = (filters: FileFilter[] | undefined): Electron.FileFilter[] =>
  (filters ?? []).map((f) => ({ name: f.name, extensions: f.extensions }));

export async function pickFile(window: BrowserWindow | null, options: PickOptions = {}): Promise<RundownFile | null> {
  const dialogOptions: Electron.OpenDialogOptions = {
    title: options.title,
    defaultPath: options.defaultPath,
    filters: toElectronFilters(options.filters),
    properties: ['openFile']
  };
  const result = window ? await dialog.showOpenDialog(window, dialogOptions) : await dialog.showOpenDialog(dialogOptions);
  const path = result.filePaths[0];
  if (result.canceled || !path) return null;
  return { path, content: await readFile(path, 'utf8') };
}

export const readTextFile = (path: string): Promise<string> => readFile(path, 'utf8');

/** Writes UTF-8 text; without a path a save dialog asks for one. Resolves the written path, null when cancelled. */
export async function saveFile(window: BrowserWindow | null, path: string | null, content: string, options: SaveOptions = {}): Promise<string | null> {
  let target = path;
  if (!target) {
    const dialogOptions: Electron.SaveDialogOptions = {
      title: options.title,
      defaultPath: options.defaultPath,
      filters: toElectronFilters(options.filters)
    };
    const result = window ? await dialog.showSaveDialog(window, dialogOptions) : await dialog.showSaveDialog(dialogOptions);
    if (result.canceled || !result.filePath) return null;
    target = result.filePath;
  }
  // The Qt client always appended the extension of the file type.
  const extension = options.filters?.[0]?.extensions[0];
  if (extension && extname(target) === '') target = `${target}.${extension}`;
  await writeFile(target, content, 'utf8');
  return target;
}

export async function fetchText(url: string): Promise<string> {
  if (!/^https?:\/\//i.test(url)) throw new Error('Only http and https addresses can be opened');
  const response = await net.fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
  return response.text();
}
