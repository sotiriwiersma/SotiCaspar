import {
  amcp,
  DEFAULT_SETTINGS,
  type AppSettings,
  type DeviceConfig,
  type DeviceStatus,
  type LibraryEntry,
  type LibraryType,
  type OscOutputConfig,
  type Preset
} from '@soticaspar/core';
import { backend } from '../lib/backend';

/** Persisted configuration and server state shared by the whole UI. */
class AppState {
  settings = $state.raw<AppSettings>({ ...DEFAULT_SETTINGS });
  devices = $state.raw<DeviceConfig[]>([]);
  statuses = $state.raw<Record<string, DeviceStatus>>({});
  library = $state.raw<LibraryEntry[]>([]);
  presets = $state.raw<Preset[]>([]);
  oscOutputs = $state.raw<OscOutputConfig[]>([]);
  recent = $state.raw<string[]>([]);
  /** Inspector toggle: AMCP is not sent while set (state is still tracked). */
  commandsDisabled = $state(false);
  masterVolumeMuted = $state(false);
  ready = $state(false);

  /** Devices a user can pick as target: shadow servers only mirror other devices. */
  get targetDevices(): DeviceConfig[] {
    return this.devices.filter((d) => !d.shadow);
  }

  private readonly libraryIndex = $derived(new Map(this.library.map((e) => [e.id, e])));

  libraryEntry(deviceName: string, type: LibraryType, name: string): LibraryEntry | undefined {
    return this.libraryIndex.get(`${deviceName}|${type}|${name}`);
  }

  deviceByName(name: string): DeviceConfig | undefined {
    return this.devices.find((d) => d.name === name);
  }

  isConnected(deviceName: string): boolean {
    return this.statuses[deviceName]?.connected ?? false;
  }

  async init(): Promise<void> {
    const [settings, devices, statuses, library, presets, oscOutputs, recent] = await Promise.all([
      backend.getSettings(),
      backend.listDevices(),
      backend.getDeviceStatuses(),
      backend.getLibrary(),
      backend.listPresets(),
      backend.listOscOutputs(),
      backend.getOpenRecent()
    ]);
    this.settings = settings;
    this.devices = devices;
    this.statuses = Object.fromEntries(statuses.map((s) => [s.deviceName, s]));
    this.library = library;
    this.presets = presets;
    this.oscOutputs = oscOutputs;
    this.recent = recent;
    this.ready = true;

    backend.on('device-status', (status) => {
      this.statuses = { ...this.statuses, [status.deviceName]: status };
      // The server reported its channel layout (INFO): pick up the stored channels and formats.
      const device = this.deviceByName(status.deviceName);
      if (device && status.connected && status.channels > 0 && status.channels !== device.channels) void this.reloadDeviceConfigs();
    });
    backend.on('library-changed', () => void this.reloadLibrary());
  }

  async updateSettings(patch: Partial<AppSettings>): Promise<void> {
    this.settings = { ...this.settings, ...patch };
    this.settings = await backend.setSettings(patch);
  }

  async reloadLibrary(): Promise<void> {
    this.library = await backend.getLibrary();
  }

  async refreshLibrary(): Promise<void> {
    await backend.refreshLibrary();
  }

  private async reloadDeviceConfigs(): Promise<void> {
    this.devices = await backend.listDevices();
  }

  async reloadDevices(): Promise<void> {
    this.devices = await backend.listDevices();
    this.statuses = Object.fromEntries((await backend.getDeviceStatuses()).map((s) => [s.deviceName, s]));
  }

  async reloadOscOutputs(): Promise<void> {
    this.oscOutputs = await backend.listOscOutputs();
  }

  /** Inspector master volume button: mutes or restores all channels of all connected servers. */
  async toggleMasterVolume(): Promise<void> {
    this.masterVolumeMuted = !this.masterVolumeMuted;
    const volume = this.masterVolumeMuted ? 0 : 1;
    for (const device of this.devices) {
      if (!this.isConnected(device.name)) continue;
      for (let channel = 1; channel <= device.channels; channel++) {
        await backend.sendCustomCommand(device.name, amcp.setMasterVolume(channel, volume));
      }
    }
  }

  async reloadPresets(): Promise<void> {
    this.presets = await backend.listPresets();
  }

  async reloadRecent(): Promise<void> {
    this.recent = await backend.getOpenRecent();
  }
}

export const app = new AppState();
