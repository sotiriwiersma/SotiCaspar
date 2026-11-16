/**
 * Contract between the UI (renderer) and the backend (Node, runs in the Electron main process).
 * Both sides are implemented against these types, so they can be built and tested separately.
 */
import type { DeviceCommands } from './playout';

// ---------------------------------------------------------------- Persisted configuration

export interface DeviceConfig {
  /** Unique, used as `RundownItem.deviceName`. */
  name: string;
  address: string;
  /** AMCP port, normally 5250. */
  port: number;
  username: string;
  password: string;
  description: string;
  /** Mirror all playout of other devices to this one. */
  shadow: boolean;
  /** Number of channels reported by the server. */
  channels: number;
  /** Comma separated video format name per channel, e.g. `1080p5000,PAL`. */
  channelFormats: string;
  /** Channel that mirrors playout for preview, 0 = none. */
  previewChannel: number;
  /** Channel that cannot be played to, 0 = none. */
  lockedChannel: number;
  /** Reported by the server after connecting. */
  version: string;
}

export interface OscOutputConfig {
  name: string;
  address: string;
  port: number;
  description: string;
}

/** Named presets: a named bundle of rundown items stored as rundown XML. */
export interface Preset {
  name: string;
  /** Rundown XML (see `serializeNodes`). */
  value: string;
}

/** Application settings (the `Configuration` table of the Qt client). */
export interface AppSettings {
  fontSize: number;
  theme: 'Flat' | 'Curve';
  startFullscreen: boolean;
  autoRefreshLibrary: boolean;
  /** Seconds. */
  refreshLibraryInterval: number;
  showThumbnailTooltip: boolean;
  reverseOscTime: boolean;
  enableOscInputControl: boolean;
  enableOscInputMonitor: boolean;
  enableOscInputWebSocket: boolean;
  disableInAndOutPoints: boolean;
  gpiSerialPort: string;
  gpiBaudRate: number;
  oscMonitorPort: number;
  oscControlPort: number;
  oscWebSocketPort: number;
  /**
   * Unit of the Delay and Duration of a rundown item. `Frames` and `Timecode` store the same number (frames
   * of the item's channel); `Timecode` only shows and edits it as `hh:mm:ss:ff`.
   */
  delayType: 'Milliseconds' | 'Frames' | 'Timecode';
  rundownRepository: string;
  repositoryPort: number;
  previewOnAutoStep: boolean;
  clearDelayedCommandsOnAutoStep: boolean;
  showAudioLevelsPanel: boolean;
  showPreviewPanel: boolean;
  showLivePanel: boolean;
  showCountdownBar: boolean;
  /**
   * What the countdown bar follows: the video that was started last (`latest`), the selected rundown row
   * (`selected`, videos only) or a fixed layer (`layer`, see `countdownLayer`).
   */
  countdownSource: 'latest' | 'selected' | 'layer';
  /** The layer of the `layer` source: `device|channel|layer`. */
  countdownLayer: string;
  markUsedItems: boolean;
  useFreezeOnLoad: boolean;
  disableAudioInStream: boolean;
  streamQuality: number;
  networkCache: number;
  streamPort: number;
  logLevel: number;
  useDropFrameNotation: boolean;
  /** Number of entries kept in the "open recent" list. */
  openRecent: number;
  /**
   * Properties that new clips start with, per item type (`MOVIE`, `STILL`, `AUDIO`, `TEMPLATE`). Only the
   * properties that differ from the item's own defaults are stored.
   */
  clipDefaults: ClipDefaults;
}

export type ClipDefaults = Record<string, Record<string, string | number | boolean>>;

export const DEFAULT_SETTINGS: AppSettings = {
  fontSize: 12,
  theme: 'Flat',
  startFullscreen: false,
  autoRefreshLibrary: false,
  refreshLibraryInterval: 60,
  showThumbnailTooltip: true,
  reverseOscTime: true,
  enableOscInputControl: true,
  enableOscInputMonitor: true,
  enableOscInputWebSocket: true,
  disableInAndOutPoints: true,
  gpiSerialPort: 'COM1',
  gpiBaudRate: 115200,
  oscMonitorPort: 6250,
  oscControlPort: 3250,
  oscWebSocketPort: 4250,
  delayType: 'Milliseconds',
  rundownRepository: '',
  repositoryPort: 8250,
  previewOnAutoStep: false,
  clearDelayedCommandsOnAutoStep: false,
  showAudioLevelsPanel: true,
  showPreviewPanel: true,
  showLivePanel: true,
  showCountdownBar: true,
  countdownSource: 'latest',
  countdownLayer: '',
  markUsedItems: false,
  useFreezeOnLoad: false,
  disableAudioInStream: true,
  streamQuality: 25,
  networkCache: 1000,
  streamPort: 9250,
  logLevel: -1,
  useDropFrameNotation: false,
  openRecent: 10,
  clipDefaults: {}
};

// ---------------------------------------------------------------- Library

export type LibraryType = 'AUDIO' | 'DATA' | 'MOVIE' | 'STILL' | 'TEMPLATE';

export interface LibraryEntry {
  /** Stable key: `${deviceName}|${type}|${name}`. */
  id: string;
  deviceName: string;
  type: LibraryType;
  /** Server relative name, e.g. `FOLDER/CLIP`. */
  name: string;
  /** Duration as `HH:MM:SS:FF` for media, empty otherwise. */
  timecode: string;
  /** Base64 PNG thumbnail data (without data: prefix), empty when none. */
  thumbnail: string;
}

// ---------------------------------------------------------------- Devices

export interface DeviceStatus {
  deviceName: string;
  connected: boolean;
  /** CasparCG server version string when connected. */
  version: string;
  /** Number of channels reported by `INFO`. */
  channels: number;
}

// ---------------------------------------------------------------- OSC

/** A parsed OSC message, as sent by the CasparCG server. */
export interface OscMessage {
  path: string;
  args: Array<string | number | boolean | null>;
}

/** Subscribes the UI to OSC messages of one device. `path` e.g. `/channel/1/stage/layer/10/foreground/file/time`. */
export interface OscSubscription {
  id: string;
  deviceName: string;
  path: string;
}

/** Remote control command received on the OSC control port, e.g. `/control/play` or `/control/<uid>/stop`. */
export interface ControlCommand {
  /** Item UID for item scoped commands, `undefined` for rundown wide ones. */
  uid?: string;
  /** Lower case command name: stop, play, playnow, load, pause, next, update, invoke, preview, clear, clearvideolayer, clearchannel, up, down, playnowifchannel, playandautostep, playnowandautostep. */
  command: string;
  args: Array<string | number | boolean | null>;
}

// ---------------------------------------------------------------- Live stream

/** Picture of one channel, streamed by the server to the Live panel. */
export interface LiveStreamRequest {
  deviceName: string;
  channel: number;
  /** Stream the key (alpha) instead of the fill. */
  key: boolean;
  /** Larger picture for the pop-out window instead of the panel. */
  large: boolean;
}

// ---------------------------------------------------------------- Rundown repository (RRUP)

/** A story added to or removed from a repository rundown, pushed by the repository server. */
export type RepositoryChange =
  | { type: 'ADD'; storyId: string; /** Rundown XML (`<items>`) of the story; its items carry the story id. */ data: string }
  | { type: 'REMOVE'; storyId: string };

/** Live updates for a rundown opened from the repository. `url` is the rundown URL (`.../<profile>/<rundown>`). */
export interface RepositorySubscription {
  id: string;
  url: string;
}

// ---------------------------------------------------------------- API

export interface BackendEvents {
  'device-status': DeviceStatus;
  'library-changed': { entries: number };
  'osc-message': { subscriptionId: string; message: OscMessage };
  'control-command': ControlCommand;
  'gpi-input': { port: number; risingEdge: boolean };
  'gpi-connection': { connected: boolean };
  'repository-change': { subscriptionId: string; change: RepositoryChange };
  'repository-status': { subscriptionId: string; connected: boolean };
  'log': { level: 'debug' | 'info' | 'warn' | 'error'; message: string };
}

export type Unsubscribe = () => void;

export interface BackendApi {
  // Settings and persisted configuration
  getSettings(): Promise<AppSettings>;
  setSettings(patch: Partial<AppSettings>): Promise<AppSettings>;
  listDevices(): Promise<DeviceConfig[]>;
  saveDevice(device: DeviceConfig, previousName?: string): Promise<void>;
  removeDevice(name: string): Promise<void>;
  listOscOutputs(): Promise<OscOutputConfig[]>;
  saveOscOutput(output: OscOutputConfig, previousName?: string): Promise<void>;
  removeOscOutput(name: string): Promise<void>;
  listPresets(): Promise<Preset[]>;
  savePreset(preset: Preset): Promise<void>;
  removePreset(name: string): Promise<void>;
  getOpenRecent(): Promise<string[]>;
  addOpenRecent(path: string): Promise<void>;

  // Devices
  getDeviceStatuses(): Promise<DeviceStatus[]>;

  // Playout
  /** Sends already built AMCP commands. Unconnected devices are skipped silently. */
  sendCommands(batches: readonly DeviceCommands[]): Promise<void>;
  /** Sends one raw AMCP command and resolves with the raw response text. */
  sendCustomCommand(deviceName: string, command: string): Promise<string>;
  /** Sends an OSC message to a configured OSC output (the OSCOUTPUT item). */
  sendOsc(outputName: string, path: string, type: string, value: string, useBundle: boolean): Promise<void>;
  /** Performs an HTTP request (the HTTPGET/HTTPPOST items). */
  sendHttp(request: { method: 'GET' | 'POST'; url: string; data: Array<{ key: string; value: string }> }): Promise<void>;
  /** Pulses a GPI output port. */
  sendGpo(port: number): Promise<void>;

  // Library
  getLibrary(): Promise<LibraryEntry[]>;
  /** Re-reads media, templates, data and thumbnails from all connected devices. */
  refreshLibrary(): Promise<void>;
  /** Template data stored on the server (`DATA RETRIEVE`). */
  retrieveData(deviceName: string, name: string): Promise<string>;

  // OSC monitoring
  oscSubscribe(subscription: OscSubscription): Promise<void>;
  oscUnsubscribe(id: string): Promise<void>;

  // Live stream (one at a time)
  /**
   * Asks the server to stream a channel to this machine and resolves with a local WebSocket URL that relays
   * the MPEG-TS stream. A running stream is stopped first.
   */
  startLiveStream(request: LiveStreamRequest): Promise<{ url: string }>;
  stopLiveStream(): Promise<void>;

  // Rundown repository
  /** Connects to the RRUP server of the rundown's host (port `repositoryPort`) and reports its changes. Replaces a subscription with the same id. */
  repositorySubscribe(subscription: RepositorySubscription): Promise<void>;
  repositoryUnsubscribe(id: string): Promise<void>;

  // Events
  on<K extends keyof BackendEvents>(event: K, listener: (payload: BackendEvents[K]) => void): Unsubscribe;
}
