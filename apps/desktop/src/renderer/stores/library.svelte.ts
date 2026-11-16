import type { LibraryEntry, LibraryType } from '@soticaspar/core';
import { backend } from '../lib/backend';
import { shell } from '../lib/shell';
import { app } from './app.svelte';
import { ui } from './ui.svelte';

export type LibraryTab = 'tools' | LibraryType | 'PRESETS';

export const LIBRARY_TABS: ReadonlyArray<{ id: LibraryTab; title: string }> = [
  { id: 'tools', title: 'Tools' },
  { id: 'AUDIO', title: 'Audio' },
  { id: 'STILL', title: 'Image' },
  { id: 'TEMPLATE', title: 'Template' },
  { id: 'MOVIE', title: 'Video' },
  { id: 'DATA', title: 'Data' },
  { id: 'PRESETS', title: 'Presets' }
];

const PRESET_FILTER = [{ name: 'Preset', extensions: ['xml'] }];

/** UI state of the library panel plus the filtered views of the server library. */
class LibraryState {
  tab = $state<LibraryTab>('tools');
  text = $state('');
  /** Device names to show; empty means all ("All" in the Qt device filter). */
  devices = $state.raw<ReadonlySet<string>>(new Set());
  selectedPreset = $state<string | null>(null);
  /** The library entry selected last; the Preview panel shows it until a rundown item is selected. */
  focused = $state.raw<LibraryEntry | null>(null);

  get filtered(): ReadonlyMap<LibraryType, LibraryEntry[]> {
    const needle = this.text.trim().toLowerCase();
    const devices = this.devices;
    const result = new Map<LibraryType, LibraryEntry[]>();
    for (const entry of app.library) {
      if (devices.size > 0 && !devices.has(entry.deviceName)) continue;
      if (needle !== '' && !entry.name.toLowerCase().includes(needle)) continue;
      const list = result.get(entry.type);
      if (list) list.push(entry);
      else result.set(entry.type, [entry]);
    }
    return result;
  }

  get filteredPresets() {
    const needle = this.text.trim().toLowerCase();
    return needle === '' ? app.presets : app.presets.filter((p) => p.name.toLowerCase().includes(needle));
  }

  toggleDevice(name: string): void {
    const next = new Set(this.devices);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    this.devices = next;
  }

  clearDevices(): void {
    this.devices = new Set();
  }

  async importPreset(): Promise<void> {
    try {
      const file = await shell.pickFile({ title: 'Import Preset', filters: PRESET_FILTER });
      if (!file || file.content.trim() === '') return;
      const name = (file.path.split(/[\\/]/).pop() ?? file.path).replace(/\.xml$/i, '');
      await backend.savePreset({ name, value: file.content });
      await app.reloadPresets();
    } catch (error) {
      ui.notify(`Could not import preset: ${String(error)}`, true);
    }
  }

  async exportSelectedPreset(): Promise<void> {
    const preset = app.presets.find((p) => p.name === this.selectedPreset);
    if (!preset) return;
    try {
      await shell.saveFile(null, preset.value, { title: 'Export Preset', defaultPath: `${preset.name}.xml`, filters: PRESET_FILTER });
    } catch (error) {
      ui.notify(`Could not export preset: ${String(error)}`, true);
    }
  }

  async deletePreset(name: string): Promise<void> {
    await backend.removePreset(name);
    if (this.selectedPreset === name) this.selectedPreset = null;
    await app.reloadPresets();
  }
}

export const library = new LibraryState();
