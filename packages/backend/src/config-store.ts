import { join } from 'node:path';
import { DEFAULT_SETTINGS } from '@soticaspar/core';
import type { AppSettings, DeviceConfig, OscOutputConfig, Preset } from '@soticaspar/core';
import type { LogFn } from './events';
import { JsonFile } from './json-file';

export type DeviceInfo = Pick<DeviceConfig, 'version' | 'channels' | 'channelFormats'>;

const DEFAULT_DEVICE: DeviceConfig = {
  name: '',
  address: '',
  port: 5250,
  username: '',
  password: '',
  description: '',
  shadow: false,
  channels: 0,
  channelFormats: '',
  previewChannel: 0,
  lockedChannel: 0,
  version: ''
};

const DEFAULT_OSC_OUTPUT: OscOutputConfig = { name: '', address: '', port: 0, description: '' };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Copies the keys of `defaults` from `raw`, keeping the default for anything missing or of the wrong type. */
function pickKnown<T extends object>(raw: unknown, defaults: T): T {
  const result = { ...defaults };
  if (!isRecord(raw)) return result;
  for (const key of Object.keys(defaults) as Array<keyof T>) {
    const value = raw[key as string];
    const expected = typeof defaults[key];
    if (typeof value === expected && (expected !== 'number' || Number.isFinite(value))) result[key] = value as T[keyof T];
  }
  return result;
}

function sanitizeList<T extends { name: string }>(raw: unknown, defaults: T, isValid: (item: T) => boolean): T[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const items: T[] = [];
  for (const entry of raw) {
    const item = pickKnown(entry, defaults);
    if (!isValid(item) || seen.has(item.name)) continue;
    seen.add(item.name);
    items.push(item);
  }
  return items;
}

/** Inserts or replaces by name. A rename (`previousName`) keeps the position of the renamed entry. */
function upsertNamed<T extends { name: string }>(list: T[], item: T, kind: string, previousName?: string): void {
  if (item.name.trim() === '') throw new Error(`${kind} name must not be empty`);
  const index = list.findIndex((entry) => entry.name === (previousName ?? item.name));
  const clash = list.findIndex((entry) => entry.name === item.name);
  if (clash !== -1 && clash !== index) throw new Error(`${kind} "${item.name}" already exists`);
  if (index === -1) list.push(item);
  else list[index] = item;
}

function removeNamed<T extends { name: string }>(list: T[], name: string): boolean {
  const index = list.findIndex((entry) => entry.name === name);
  if (index === -1) return false;
  list.splice(index, 1);
  return true;
}

export const sanitizeSettings = (raw: unknown): AppSettings => pickKnown(raw, DEFAULT_SETTINGS);

/** Persists the application configuration as JSON files in a data directory. */
export class ConfigStore {
  private settingsData: AppSettings = { ...DEFAULT_SETTINGS };
  private deviceData: DeviceConfig[] = [];
  private outputData: OscOutputConfig[] = [];
  private presetData: Preset[] = [];
  private recentData: string[] = [];

  private readonly files: Record<'settings' | 'devices' | 'oscOutputs' | 'presets' | 'openRecent', JsonFile>;

  constructor(dataDir: string, log: LogFn) {
    this.files = {
      settings: new JsonFile(join(dataDir, 'settings.json'), log),
      devices: new JsonFile(join(dataDir, 'devices.json'), log),
      oscOutputs: new JsonFile(join(dataDir, 'osc-outputs.json'), log),
      presets: new JsonFile(join(dataDir, 'presets.json'), log),
      openRecent: new JsonFile(join(dataDir, 'open-recent.json'), log)
    };
  }

  async load(): Promise<void> {
    const [settings, devices, outputs, presets, recent] = await Promise.all(Object.values(this.files).map((file) => file.read()));

    this.settingsData = sanitizeSettings(settings);
    this.deviceData = sanitizeList(devices, DEFAULT_DEVICE, (d) => d.name !== '' && d.address !== '');
    this.outputData = sanitizeList(outputs, DEFAULT_OSC_OUTPUT, (o) => o.name !== '');
    this.presetData = sanitizeList(presets, { name: '', value: '' }, (p) => p.name !== '');
    this.recentData = Array.isArray(recent) ? recent.filter((p): p is string => typeof p === 'string') : [];
    this.recentData.length = Math.min(this.recentData.length, this.settingsData.openRecent);
  }

  async flush(): Promise<void> {
    await Promise.all(Object.values(this.files).map((file) => file.flush()));
  }

  // ------------------------------------------------------------ Settings

  settings(): AppSettings {
    return { ...this.settingsData };
  }

  async updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
    this.settingsData = sanitizeSettings({ ...this.settingsData, ...patch });
    const trimmed = this.recentData.slice(0, this.settingsData.openRecent);
    const recentChanged = trimmed.length !== this.recentData.length;
    this.recentData = trimmed;

    await Promise.all([this.files.settings.write(this.settingsData), recentChanged ? this.files.openRecent.write(this.recentData) : undefined]);
    return this.settings();
  }

  // ------------------------------------------------------------ Devices

  devices(): DeviceConfig[] {
    return this.deviceData.map((device) => ({ ...device }));
  }

  async saveDevice(device: DeviceConfig, previousName?: string): Promise<void> {
    const next = pickKnown(device, DEFAULT_DEVICE);
    if (next.address.trim() === '') throw new Error('Device address must not be empty');
    upsertNamed(this.deviceData, next, 'Device', previousName);
    await this.files.devices.write(this.deviceData);
  }

  async removeDevice(name: string): Promise<void> {
    if (removeNamed(this.deviceData, name)) await this.files.devices.write(this.deviceData);
  }

  /** Stores what the server reported about a device. */
  async updateDeviceInfo(name: string, info: DeviceInfo): Promise<void> {
    const device = this.deviceData.find((d) => d.name === name);
    if (!device) return;
    Object.assign(device, info);
    await this.files.devices.write(this.deviceData);
  }

  // ------------------------------------------------------------ OSC outputs

  oscOutputs(): OscOutputConfig[] {
    return this.outputData.map((output) => ({ ...output }));
  }

  async saveOscOutput(output: OscOutputConfig, previousName?: string): Promise<void> {
    upsertNamed(this.outputData, pickKnown(output, DEFAULT_OSC_OUTPUT), 'OSC output', previousName);
    await this.files.oscOutputs.write(this.outputData);
  }

  async removeOscOutput(name: string): Promise<void> {
    if (removeNamed(this.outputData, name)) await this.files.oscOutputs.write(this.outputData);
  }

  // ------------------------------------------------------------ Presets

  presets(): Preset[] {
    return this.presetData.map((preset) => ({ ...preset }));
  }

  async savePreset(preset: Preset): Promise<void> {
    upsertNamed(this.presetData, pickKnown(preset, { name: '', value: '' }), 'Preset');
    await this.files.presets.write(this.presetData);
  }

  async removePreset(name: string): Promise<void> {
    if (removeNamed(this.presetData, name)) await this.files.presets.write(this.presetData);
  }

  // ------------------------------------------------------------ Open recent

  /** Most recent first. */
  openRecent(): string[] {
    return [...this.recentData];
  }

  async addOpenRecent(path: string): Promise<void> {
    this.recentData = [path, ...this.recentData.filter((p) => p !== path)].slice(0, this.settingsData.openRecent);
    await this.files.openRecent.write(this.recentData);
  }
}
