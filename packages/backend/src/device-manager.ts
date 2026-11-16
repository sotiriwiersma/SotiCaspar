import { amcp } from '@soticaspar/core';
import type { DeviceCommands, DeviceConfig, DeviceStatus } from '@soticaspar/core';
import { AmcpConnection } from './amcp-connection';
import type { AmcpConnectionOptions } from './amcp-connection';
import { isSuccess, parseChannelFormats } from './amcp-parser';
import type { AmcpResponse } from './amcp-parser';
import type { DeviceInfo } from './config-store';
import type { LogFn } from './events';

export interface DeviceManagerOptions {
  log: LogFn;
  onStatus: (status: DeviceStatus) => void;
  onConnected: (deviceName: string) => void;
  /** The server reported a new version or channel layout. */
  onInfo: (deviceName: string, info: DeviceInfo) => void;
  /** The device was removed or its address changed, so anything learned from it is stale. */
  onRemoved: (deviceName: string) => void;
  timing?: Pick<AmcpConnectionOptions, 'reconnectDelayMs' | 'requestTimeoutMs' | 'connectTimeoutMs'>;
}

interface ManagedDevice {
  config: DeviceConfig;
  connection: AmcpConnection;
}

/** Owns one AMCP connection per configured device. */
export class DeviceManager {
  private readonly devices = new Map<string, ManagedDevice>();

  constructor(private readonly options: DeviceManagerOptions) {}

  /** Makes the connections match the configuration. Devices whose address or port changed reconnect. */
  sync(configs: readonly DeviceConfig[]): void {
    const wanted = new Map(configs.map((config) => [config.name, config]));

    for (const [name, device] of this.devices) {
      const next = wanted.get(name);
      if (next && next.address === device.config.address && next.port === device.config.port) continue;

      const wasConnected = device.connection.connected;
      device.connection.stop();
      this.devices.delete(name);
      this.options.onRemoved(name);
      if (next && wasConnected) this.options.onStatus({ ...statusOf(device), connected: false });
    }

    for (const config of configs) {
      const device = this.devices.get(config.name);
      if (device) device.config = { ...config };
      else this.add(config);
    }
  }

  config(name: string): DeviceConfig | undefined {
    return this.devices.get(name)?.config;
  }

  isConnected(name: string): boolean {
    return this.devices.get(name)?.connection.connected ?? false;
  }

  statuses(): DeviceStatus[] {
    return [...this.devices.values()].map(statusOf);
  }

  send(name: string, command: string): Promise<AmcpResponse> {
    const device = this.devices.get(name);
    if (!device) return Promise.reject(new Error(`Unknown device "${name}"`));
    return device.connection.send(command);
  }

  /** Fire and forget; devices that are not connected are skipped. */
  sendCommands(batches: readonly DeviceCommands[]): void {
    for (const { deviceName, commands } of batches) {
      const device = this.devices.get(deviceName);
      if (!device?.connection.connected) continue;
      for (const command of commands) device.connection.post(command);
    }
  }

  /** Reads the server version and channel layout, and reports what changed. */
  async queryServerInfo(name: string): Promise<void> {
    const device = this.devices.get(name);
    if (!device) return;

    const [version, channels] = await Promise.all([this.send(name, amcp.refreshServerVersion()), this.send(name, amcp.refreshChannels())]);
    const info: DeviceInfo = { version: device.config.version, channels: device.config.channels, channelFormats: device.config.channelFormats };

    if (isSuccess(version) && version.body.length > 0) info.version = version.body[0];
    if (isSuccess(channels)) {
      const formats = parseChannelFormats(channels.body);
      info.channels = formats.length;
      info.channelFormats = formats.join(',');
    }

    if (info.version === device.config.version && info.channels === device.config.channels && info.channelFormats === device.config.channelFormats) return;
    Object.assign(device.config, info);
    this.options.onInfo(name, info);
    this.options.onStatus(statusOf(device));
  }

  dispose(): void {
    for (const device of this.devices.values()) device.connection.stop();
    this.devices.clear();
  }

  private add(config: DeviceConfig): void {
    const connection = new AmcpConnection({
      ...this.options.timing,
      address: config.address,
      port: config.port,
      log: this.options.log,
      onConnectionChange: (connected) => {
        this.options.onStatus(statusOf(device));
        if (connected) this.options.onConnected(config.name);
      }
    });
    const device: ManagedDevice = { config: { ...config }, connection };
    this.devices.set(config.name, device);
    connection.start();
  }
}

const statusOf = ({ config, connection }: ManagedDevice): DeviceStatus => ({
  deviceName: config.name,
  connected: connection.connected,
  version: config.version,
  channels: config.channels
});
