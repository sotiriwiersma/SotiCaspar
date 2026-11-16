import {
  DEFAULT_SETTINGS,
  type AppSettings,
  type BackendApi,
  type BackendEvents,
  type ControlCommand,
  type DeviceCommands,
  type DeviceConfig,
  type DeviceStatus,
  type LibraryEntry,
  type LibraryType,
  type OscMessage,
  type OscOutputConfig,
  type OscSubscription,
  type Preset,
  type Unsubscribe
} from '@soticaspar/core';

// 1x1 PNG, stretched by the UI.
const PIXEL_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const device = (name: string, address: string, overrides: Partial<DeviceConfig> = {}): DeviceConfig => ({
  name,
  address,
  port: 5250,
  username: '',
  password: '',
  description: '',
  shadow: false,
  channels: 3,
  channelFormats: '1080p5000,1080p5000,PAL',
  previewChannel: 0,
  lockedChannel: 0,
  version: '2.4.0',
  ...overrides
});

const media = (deviceName: string, type: LibraryType, name: string, timecode = ''): LibraryEntry => ({
  id: `${deviceName}|${type}|${name}`,
  deviceName,
  type,
  name,
  timecode,
  thumbnail: type === 'MOVIE' || type === 'STILL' ? PIXEL_PNG : ''
});

const frames = (n: number): string => `00:00:${String(n % 60).padStart(2, '0')}:00`;

function seedLibrary(): LibraryEntry[] {
  const entries: LibraryEntry[] = [];
  for (const dev of ['Studio A', 'Studio B']) {
    for (let i = 1; i <= 150; i++) entries.push(media(dev, 'MOVIE', `CLIPS/CLIP_${String(i).padStart(3, '0')}`, frames(i + 5)));
    for (let i = 1; i <= 20; i++) entries.push(media(dev, 'STILL', `GFX/STILL_${i}`));
    for (let i = 1; i <= 8; i++) entries.push(media(dev, 'AUDIO', `MUSIC/TRACK_${i}`, frames(i * 7)));
    for (const t of ['LOWERTHIRD', 'SCOREBOARD', 'TICKER']) entries.push(media(dev, 'TEMPLATE', `TEMPLATES/${t}`));
    entries.push(media(dev, 'DATA', 'SPORTS/HOME_TEAM'), media(dev, 'DATA', 'SPORTS/AWAY_TEAM'));
  }
  return entries;
}

interface PlayingLayer {
  deviceName: string;
  channel: number;
  layer: number;
  name: string;
  startedAt: number;
  paused: boolean;
  pausedAt: number;
}

/** In-memory `BackendApi` used by the browser dev server, tests and as a fallback without a real backend. */
export class MockBackend implements BackendApi {
  readonly sent: DeviceCommands[] = [];
  readonly sentCustom: Array<{ deviceName: string; command: string }> = [];

  private settings: AppSettings = { ...DEFAULT_SETTINGS, showDurationPanel: true };
  private devices: DeviceConfig[] = [
    device('Studio A', '192.168.1.10', { channels: 3, previewChannel: 3, description: 'Main playout' }),
    device('Studio B', '192.168.1.11', { channels: 2, channelFormats: '720p5000,PAL' })
  ];
  private oscOutputs: OscOutputConfig[] = [{ name: 'Lights', address: '192.168.1.50', port: 7250, description: 'Light desk' }];
  private presets: Preset[] = [];
  private recent: string[] = [];
  private library = seedLibrary();
  private readonly listeners = new Map<keyof BackendEvents, Set<(payload: never) => void>>();
  private readonly subscriptions = new Map<string, OscSubscription>();
  private readonly playing = new Map<string, PlayingLayer>();
  private ticker: ReturnType<typeof setInterval> | undefined;

  async getSettings(): Promise<AppSettings> {
    return { ...this.settings };
  }

  async setSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
    this.settings = { ...this.settings, ...patch };
    return { ...this.settings };
  }

  async listDevices(): Promise<DeviceConfig[]> {
    return this.devices.map((d) => ({ ...d }));
  }

  async saveDevice(config: DeviceConfig, previousName?: string): Promise<void> {
    const index = this.devices.findIndex((d) => d.name === (previousName ?? config.name));
    if (index === -1) this.devices.push({ ...config });
    else this.devices[index] = { ...config };
    this.emit('device-status', this.statusOf(config));
  }

  async removeDevice(name: string): Promise<void> {
    this.devices = this.devices.filter((d) => d.name !== name);
  }

  async listOscOutputs(): Promise<OscOutputConfig[]> {
    return this.oscOutputs.map((o) => ({ ...o }));
  }

  async saveOscOutput(output: OscOutputConfig, previousName?: string): Promise<void> {
    const index = this.oscOutputs.findIndex((o) => o.name === (previousName ?? output.name));
    if (index === -1) this.oscOutputs.push({ ...output });
    else this.oscOutputs[index] = { ...output };
  }

  async removeOscOutput(name: string): Promise<void> {
    this.oscOutputs = this.oscOutputs.filter((o) => o.name !== name);
  }

  async listPresets(): Promise<Preset[]> {
    return this.presets.map((p) => ({ ...p }));
  }

  async savePreset(preset: Preset): Promise<void> {
    this.presets = [...this.presets.filter((p) => p.name !== preset.name), { ...preset }];
  }

  async removePreset(name: string): Promise<void> {
    this.presets = this.presets.filter((p) => p.name !== name);
  }

  async getOpenRecent(): Promise<string[]> {
    return [...this.recent];
  }

  async addOpenRecent(path: string): Promise<void> {
    this.recent = [path, ...this.recent.filter((p) => p !== path)].slice(0, this.settings.openRecent);
  }

  async getDeviceStatuses(): Promise<DeviceStatus[]> {
    return this.devices.map((d) => this.statusOf(d));
  }

  async sendCommands(batches: readonly DeviceCommands[]): Promise<void> {
    for (const batch of batches) {
      this.sent.push({ deviceName: batch.deviceName, commands: [...batch.commands] });
      for (const command of batch.commands) this.trackPlayback(batch.deviceName, command);
    }
  }

  async sendCustomCommand(deviceName: string, command: string): Promise<string> {
    this.sentCustom.push({ deviceName, command });
    return '202 OK';
  }

  async sendOsc(): Promise<void> {}
  async sendHttp(): Promise<void> {}
  async sendGpo(): Promise<void> {}

  async getLibrary(): Promise<LibraryEntry[]> {
    return this.library.map((e) => ({ ...e }));
  }

  async refreshLibrary(): Promise<void> {
    this.emit('library-changed', { entries: this.library.length });
  }

  async retrieveData(): Promise<string> {
    return '<templateData><componentData id="f0"><data id="text" value="Mock"/></componentData></templateData>';
  }

  async oscSubscribe(subscription: OscSubscription): Promise<void> {
    this.subscriptions.set(subscription.id, subscription);
    this.ensureTicker();
  }

  async oscUnsubscribe(id: string): Promise<void> {
    this.subscriptions.delete(id);
  }

  async startLiveStream(): Promise<{ url: string }> {
    throw new Error('The live stream needs a real CasparCG server');
  }

  async stopLiveStream(): Promise<void> {}

  async repositorySubscribe(): Promise<void> {}

  async repositoryUnsubscribe(): Promise<void> {}

  on<K extends keyof BackendEvents>(event: K, listener: (payload: BackendEvents[K]) => void): Unsubscribe {
    let set = this.listeners.get(event);
    if (!set) this.listeners.set(event, (set = new Set()));
    set.add(listener as (payload: never) => void);
    return () => set.delete(listener as (payload: never) => void);
  }

  emit<K extends keyof BackendEvents>(event: K, payload: BackendEvents[K]): void {
    this.listeners.get(event)?.forEach((listener) => (listener as (p: BackendEvents[K]) => void)(payload));
  }

  /** Test/dev helper: simulates a remote control message. */
  simulateControl(command: ControlCommand): void {
    this.emit('control-command', command);
  }

  dispose(): void {
    if (this.ticker) clearInterval(this.ticker);
    this.ticker = undefined;
  }

  private statusOf(config: DeviceConfig): DeviceStatus {
    return { deviceName: config.name, connected: true, version: config.version, channels: config.channels };
  }

  private trackPlayback(deviceName: string, command: string): void {
    const play = /^(?:PLAY|LOAD) (\d+)-(\d+)(?: "([^"]*)")?/i.exec(command);
    if (play && /^PLAY/i.test(command)) {
      const [, channel, layer, name] = play;
      const key = `${deviceName}|${channel}|${layer}`;
      const existing = this.playing.get(key);
      if (existing && !name) {
        existing.paused = false;
      } else {
        this.playing.set(key, { deviceName, channel: Number(channel), layer: Number(layer), name: name ?? '', startedAt: Date.now(), paused: false, pausedAt: 0 });
      }
      this.ensureTicker();
      return;
    }
    const other = /^(STOP|CLEAR|PAUSE|RESUME) (\d+)(?:-(\d+))?/i.exec(command);
    if (!other) return;
    const [, verb, channel, layer] = other;
    for (const [key, entry] of this.playing) {
      if (entry.deviceName !== deviceName || entry.channel !== Number(channel)) continue;
      if (layer !== undefined && entry.layer !== Number(layer)) continue;
      if (/^PAUSE/i.test(verb)) {
        entry.paused = true;
        entry.pausedAt = Date.now();
      } else if (/^RESUME/i.test(verb)) {
        entry.startedAt += Date.now() - entry.pausedAt;
        entry.paused = false;
      } else this.playing.delete(key);
    }
  }

  private ensureTicker(): void {
    if (this.ticker) return;
    this.ticker = setInterval(() => this.tick(), 100);
  }

  private tick(): void {
    if (this.subscriptions.size === 0) return;
    for (const subscription of this.subscriptions.values()) {
      const message = this.messageFor(subscription);
      if (message) this.emit('osc-message', { subscriptionId: subscription.id, message });
    }
  }

  private messageFor(subscription: OscSubscription): OscMessage | null {
    const layerMatch = /^\/channel\/(\d+)\/stage\/layer\/(\d+)\/foreground\/(.+)$/.exec(subscription.path);
    if (layerMatch) {
      const entry = this.playing.get(`${subscription.deviceName}|${layerMatch[1]}|${layerMatch[2]}`);
      if (!entry) return null;
      const elapsed = ((entry.paused ? entry.pausedAt : Date.now()) - entry.startedAt) / 1000;
      const total = 30;
      switch (layerMatch[3]) {
        case 'file/time': return { path: subscription.path, args: [elapsed % total, total] };
        case 'file/clip': return { path: subscription.path, args: [0, total] };
        case 'file/name': return { path: subscription.path, args: [`${entry.name}.mp4`] };
        case 'paused': return { path: subscription.path, args: [entry.paused] };
        case 'loop': return { path: subscription.path, args: [false] };
        default: return null;
      }
    }
    const channelMatch = /^\/channel\/(\d+)\/(framerate|mixer\/audio\/volume)$/.exec(subscription.path);
    if (!channelMatch) return null;
    if (channelMatch[2] === 'framerate') return { path: subscription.path, args: [50, 1] };
    const level = Math.round(2147483647 * (0.2 + 0.15 * Math.sin(Date.now() / 300)));
    return { path: subscription.path, args: [level, level, 0, 0, 0, 0, 0, 0] };
  }
}
