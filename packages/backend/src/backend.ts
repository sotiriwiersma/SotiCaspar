import { join } from 'node:path';
import type {
  AppSettings,
  BackendApi,
  BackendEvents,
  CompanionPress,
  DeviceCommands,
  DeviceConfig,
  DeviceStatus,
  LibraryEntry,
  LiveStreamRequest,
  OscOutputConfig,
  OscSubscription,
  Preset,
  RepositorySubscription,
  Unsubscribe
} from '@soticaspar/core';
import { amcp, companionCommand } from '@soticaspar/core';
import { ConfigStore } from './config-store';
import { isSuccess } from './amcp-parser';
import { DeviceManager } from './device-manager';
import type { DeviceManagerOptions } from './device-manager';
import { TypedEmitter } from './events';
import type { LogFn } from './events';
import { JsonFile } from './json-file';
import { Library } from './library';
import { OscRouter } from './osc-router';
import { ServiceSlot } from './service-slot';
import { CompanionClient, OscControlServer, OscMonitor, OscSender, OscWebSocketServer, RrupClient, StreamRelay, sendHttp, type CompanionTarget } from './services/index';
import { ThumbnailCache } from './thumbnails';

export interface BackendOptions {
  /** Directory for settings, devices, presets and caches. Created when missing. */
  dataDir: string;
  /** Receives every log message, including debug ones that are not published as `log` events. */
  log?: LogFn;
  /** Connection timing overrides for tests. */
  timing?: DeviceManagerOptions['timing'];
}

export type Backend = BackendApi & { dispose(): Promise<void> };

class BackendImpl implements Backend {
  private readonly emitter: TypedEmitter<BackendEvents>;
  private readonly log: LogFn;
  private readonly thumbnails: ThumbnailCache;
  private readonly store: ConfigStore;
  private readonly library: Library;
  private readonly devices: DeviceManager;
  private readonly router: OscRouter;
  private readonly sender = new OscSender();
  private readonly monitor: ServiceSlot;
  private readonly control: ServiceSlot;
  private readonly webSocket: ServiceSlot;
  private readonly streamRelay: StreamRelay;
  private readonly companion: CompanionClient;
  /** Where the server currently streams to, so the consumer can be removed again. */
  private liveStream: { deviceName: string; channel: number; port: number } | undefined;
  private readonly repositories = new Map<string, RrupClient>();
  private autoRefresh: NodeJS.Timeout | undefined;
  private readonly ready: Promise<void>;

  constructor(options: BackendOptions) {
    this.log = (level, message) => {
      options.log?.(level, message);
      if (level !== 'debug') this.emitter.emit('log', { level, message });
    };
    const log = this.log;
    this.emitter = new TypedEmitter((error) => options.log?.('error', `Event listener failed: ${String(error)}`));

    this.thumbnails = new ThumbnailCache(join(options.dataDir, 'thumbnails'), log);
    this.store = new ConfigStore(options.dataDir, log);
    this.library = new Library({
      send: (deviceName, command) => this.devices.send(deviceName, command),
      file: new JsonFile(join(options.dataDir, 'library.json'), log),
      thumbnails: this.thumbnails,
      thumbnailsEnabled: () => this.store.settings().showThumbnailTooltip,
      onChanged: () => this.emitter.emit('library-changed', { entries: this.library.entries().length }),
      log
    });
    this.devices = new DeviceManager({
      log,
      timing: options.timing,
      onStatus: (status) => this.emitter.emit('device-status', status),
      onConnected: (name) => void this.deviceConnected(name),
      onInfo: (name, info) => void this.store.updateDeviceInfo(name, info).catch((error) => log('error', `Cannot save device info: ${String(error)}`)),
      onRemoved: (name) => void this.library.removeDevice(name).catch((error) => log('error', `Cannot clear library of ${name}: ${String(error)}`))
    });
    this.router = new OscRouter((subscriptionId, message) => this.emitter.emit('osc-message', { subscriptionId, message }));

    this.monitor = new ServiceSlot('OSC monitor', (port) => new OscMonitor(port, (source, message) => this.router.handle(source, message), log), log);
    this.control = new ServiceSlot('OSC control server', (port) => new OscControlServer(port, (command) => this.emitter.emit('control-command', command), log), log);
    this.webSocket = new ServiceSlot('OSC WebSocket server', (port) => new OscWebSocketServer(port, (command) => this.emitter.emit('control-command', command), log), log);
    this.streamRelay = new StreamRelay(log);
    this.companion = new CompanionClient(log);

    this.ready = this.start();
    this.ready.catch((error) => log('error', `Backend failed to start: ${String(error)}`));
  }

  private async start(): Promise<void> {
    await this.store.load();
    await Promise.all([this.library.load(), this.thumbnails.load()]);
    await this.applyDevices();
    await this.applySettings(this.store.settings());
  }

  async dispose(): Promise<void> {
    await this.ready.catch(() => undefined);
    clearInterval(this.autoRefresh);
    await this.stopLiveStream();
    for (const client of this.repositories.values()) client.stop();
    this.repositories.clear();
    this.companion.close();
    await Promise.all([this.monitor.stop(), this.control.stop(), this.webSocket.stop()]);
    this.devices.dispose();
    await Promise.all([this.store.flush(), this.library.flush()]);
    this.emitter.clear();
  }

  // ---------------------------------------------------------------- Settings and persisted configuration

  async getSettings(): Promise<AppSettings> {
    await this.ready;
    return this.store.settings();
  }

  async setSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
    await this.ready;
    const previous = this.store.settings();
    const settings = await this.store.updateSettings(patch);
    await this.applySettings(settings);
    if (!previous.showThumbnailTooltip && settings.showThumbnailTooltip) void this.refreshLibrary();
    const companionChanged = (['companionAddress', 'companionPort', 'companionProtocol'] as const).some((key) => previous[key] !== settings[key]);
    if (companionChanged) this.companion.close();
    return settings;
  }

  async listDevices(): Promise<DeviceConfig[]> {
    await this.ready;
    return this.store.devices();
  }

  async saveDevice(device: DeviceConfig, previousName?: string): Promise<void> {
    await this.ready;
    await this.store.saveDevice(device, previousName);
    await this.applyDevices();
  }

  async removeDevice(name: string): Promise<void> {
    await this.ready;
    await this.store.removeDevice(name);
    await this.applyDevices();
  }

  async listOscOutputs(): Promise<OscOutputConfig[]> {
    await this.ready;
    return this.store.oscOutputs();
  }

  async saveOscOutput(output: OscOutputConfig, previousName?: string): Promise<void> {
    await this.ready;
    await this.store.saveOscOutput(output, previousName);
  }

  async removeOscOutput(name: string): Promise<void> {
    await this.ready;
    await this.store.removeOscOutput(name);
  }

  async listPresets(): Promise<Preset[]> {
    await this.ready;
    return this.store.presets();
  }

  async savePreset(preset: Preset): Promise<void> {
    await this.ready;
    await this.store.savePreset(preset);
  }

  async removePreset(name: string): Promise<void> {
    await this.ready;
    await this.store.removePreset(name);
  }

  async getOpenRecent(): Promise<string[]> {
    await this.ready;
    return this.store.openRecent();
  }

  async addOpenRecent(path: string): Promise<void> {
    await this.ready;
    await this.store.addOpenRecent(path);
  }

  // ---------------------------------------------------------------- Devices and playout

  async getDeviceStatuses(): Promise<DeviceStatus[]> {
    await this.ready;
    return this.devices.statuses();
  }

  async sendCommands(batches: readonly DeviceCommands[]): Promise<void> {
    await this.ready;
    this.devices.sendCommands(batches);
  }

  async sendCustomCommand(deviceName: string, command: string): Promise<string> {
    await this.ready;
    return (await this.devices.send(deviceName, command)).raw;
  }

  async sendOsc(outputName: string, path: string, type: string, value: string, useBundle: boolean): Promise<void> {
    await this.ready;
    const output = this.store.oscOutputs().find((o) => o.name === outputName);
    if (!output) throw new Error(`Unknown OSC output "${outputName}"`);
    await this.sender.send(output, path, type, value, useBundle);
  }

  async sendHttp(request: Parameters<BackendApi['sendHttp']>[0]): Promise<void> {
    await sendHttp(request);
  }

  async sendGpo(port: number): Promise<void> {
    this.log('warn', `GPO ${port} ignored: GPI is not supported`);
  }

  // ---------------------------------------------------------------- Bitfocus Companion

  private companionTarget(): CompanionTarget {
    const { companionAddress, companionPort, companionProtocol } = this.store.settings();
    const host = companionAddress.trim();
    if (!host) throw new Error('No Companion address in Settings › Devices');
    return { protocol: companionProtocol, host, port: companionPort };
  }

  async sendCompanion(press: CompanionPress): Promise<void> {
    await this.ready;
    const target = this.companionTarget();
    const command = companionCommand(press);
    this.log('debug', `Companion ${target.protocol} ${target.host}:${target.port}: ${command}`);
    await this.companion.send(target, command);
  }

  async testCompanion(): Promise<string> {
    await this.ready;
    const target = this.companionTarget();
    await this.companion.check(target);
    return target.protocol === 'TCP'
      ? `Connected to Companion at ${target.host}:${target.port}.`
      : `UDP has no answer, so the connection cannot be checked. Commands go to ${target.host}:${target.port}.`;
  }

  // ---------------------------------------------------------------- Library

  async getLibrary(): Promise<LibraryEntry[]> {
    await this.ready;
    return this.library.entries();
  }

  async refreshLibrary(): Promise<void> {
    await this.ready;
    const connected = this.devices.statuses().filter((status) => status.connected);
    await Promise.all(connected.map((status) => this.refreshDevice(status.deviceName)));
  }

  async retrieveData(deviceName: string, name: string): Promise<string> {
    await this.ready;
    return this.library.retrieveData(deviceName, name);
  }

  // ---------------------------------------------------------------- OSC monitoring and events

  async oscSubscribe(subscription: OscSubscription): Promise<void> {
    this.router.subscribe(subscription);
  }

  async oscUnsubscribe(id: string): Promise<void> {
    this.router.unsubscribe(id);
  }

  // ---------------------------------------------------------------- Live stream

  /** Start and stop requests run one after the other so a late stop never tears down a newer stream. */
  private liveQueue: Promise<unknown> = Promise.resolve();

  private serializeLive<T>(task: () => Promise<T>): Promise<T> {
    const result = this.liveQueue.then(task);
    this.liveQueue = result.catch(() => undefined);
    return result;
  }

  startLiveStream(request: LiveStreamRequest): Promise<{ url: string }> {
    return this.serializeLive(async () => {
      await this.ready;
      await this.removeLiveStream();
      if (!this.devices.isConnected(request.deviceName)) throw new Error(`${request.deviceName} is not connected`);

      const port = this.store.settings().streamPort;
      const url = await this.streamRelay.open(port);
      const profile = request.large ? amcp.WEB_STREAM_PROFILES.large : amcp.WEB_STREAM_PROFILES.compact;
      try {
        // A stream to this PC's port left on the channel by an earlier run would be encoded twice for nothing.
        await this.devices.send(request.deviceName, amcp.stopStream(request.channel, port)).catch(() => undefined);
        const response = await this.devices.send(request.deviceName, amcp.startWebStream(request.channel, port, request.key, profile));
        if (!isSuccess(response)) throw new Error(`${request.deviceName} refused the stream: ${response.header}`);
      } catch (error) {
        await this.streamRelay.close();
        throw error;
      }
      this.liveStream = { deviceName: request.deviceName, channel: request.channel, port };
      return { url };
    });
  }

  stopLiveStream(): Promise<void> {
    return this.serializeLive(() => this.removeLiveStream());
  }

  private async removeLiveStream(): Promise<void> {
    const stream = this.liveStream;
    this.liveStream = undefined;
    if (stream && this.devices.isConnected(stream.deviceName)) {
      await this.devices.send(stream.deviceName, amcp.stopStream(stream.channel, stream.port)).catch((error) => this.log('warn', `Cannot stop the live stream: ${String(error)}`));
    }
    await this.streamRelay.close();
  }

  // ---------------------------------------------------------------- Rundown repository

  async repositorySubscribe({ id, url }: RepositorySubscription): Promise<void> {
    await this.ready;
    this.repositories.get(id)?.stop();
    const client = new RrupClient({
      url,
      port: this.store.settings().repositoryPort,
      log: this.log,
      onChange: (change) => this.emitter.emit('repository-change', { subscriptionId: id, change }),
      onConnectionChange: (connected) => this.emitter.emit('repository-status', { subscriptionId: id, connected })
    });
    this.repositories.set(id, client);
    client.start();
  }

  async repositoryUnsubscribe(id: string): Promise<void> {
    this.repositories.get(id)?.stop();
    this.repositories.delete(id);
  }

  on<K extends keyof BackendEvents>(event: K, listener: (payload: BackendEvents[K]) => void): Unsubscribe {
    return this.emitter.on(event, listener);
  }

  // ---------------------------------------------------------------- Internals

  private async applyDevices(): Promise<void> {
    const devices = this.store.devices();
    this.devices.sync(devices);
    await this.router.syncDevices(devices);
  }

  private async applySettings(settings: AppSettings): Promise<void> {
    await Promise.all([
      this.monitor.apply(settings.enableOscInputMonitor, settings.oscMonitorPort),
      this.control.apply(settings.enableOscInputControl, settings.oscControlPort),
      this.webSocket.apply(settings.enableOscInputWebSocket, settings.oscWebSocketPort)
    ]);

    clearInterval(this.autoRefresh);
    this.autoRefresh = undefined;
    if (settings.autoRefreshLibrary && settings.refreshLibraryInterval > 0) {
      this.autoRefresh = setInterval(() => void this.refreshLibrary(), settings.refreshLibraryInterval * 1000);
    }
  }

  /** Reads server info and library of a device; shadow devices only mirror playout and have none. */
  /** Devices whose leftover streams were already removed: once per session, so a reconnect keeps our own stream. */
  private readonly streamsCleaned = new Set<string>();

  private async deviceConnected(name: string): Promise<void> {
    try {
      await this.refreshDevice(name);
    } finally {
      if (!this.streamsCleaned.has(name)) {
        this.streamsCleaned.add(name);
        await this.removeLeftoverStreams(name);
      }
    }
  }

  /**
   * Removes live streams an earlier run left on a server: when the app crashes or is forced to quit it cannot remove its
   * stream, and the server keeps encoding it for nobody. Only streams to this PC's stream port are touched (the server
   * fills in this PC's address). Runs in the live stream queue and skips a server this session streams from, so it never
   * removes the stream the Live panel just started.
   */
  private removeLeftoverStreams(name: string): Promise<void> {
    return this.serializeLive(async () => {
      if (this.liveStream?.deviceName === name || !this.devices.isConnected(name) || this.devices.config(name)?.shadow) return;
      const port = this.store.settings().streamPort;
      const channels = Math.max(1, this.store.devices().find((d) => d.name === name)?.channels ?? 1);
      let removed = 0;
      for (let channel = 1; channel <= channels; channel++) {
        const response = await this.devices.send(name, amcp.stopStream(channel, port)).catch(() => undefined);
        if (response && isSuccess(response)) removed++;
      }
      if (removed > 0) this.log('info', `Removed ${removed} live stream(s) an earlier run left on ${name}`);
    });
  }

  private async refreshDevice(name: string): Promise<void> {
    if (this.devices.config(name)?.shadow) return;
    await Promise.all([
      this.devices.queryServerInfo(name).catch((error) => this.log('warn', `${name}: cannot read server info: ${String(error)}`)),
      this.library.refreshDevice(name)
    ]);
  }
}

export function createBackend(options: BackendOptions): Backend {
  return new BackendImpl(options);
}
