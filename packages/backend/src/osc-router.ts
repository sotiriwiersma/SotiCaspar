import { lookup } from 'node:dns/promises';
import type { DeviceConfig, OscMessage, OscSubscription } from '@soticaspar/core';

export type HostResolver = (host: string) => Promise<string[]>;

const resolveHost: HostResolver = async (host) => (await lookup(host, { all: true })).map((entry) => entry.address);

/** OSC datagrams from dual-stack sockets report IPv4 senders as `::ffff:a.b.c.d`. */
const normalizeAddress = (address: string) => address.replace(/^::ffff:/i, '');

interface ResolvedDevice {
  host: string;
  addresses: Set<string>;
}

/**
 * Delivers OSC messages to the subscriptions that asked for them: the datagram must come from the
 * address of the subscription's device and the message path must equal the subscribed path.
 */
export class OscRouter {
  private readonly subscriptions = new Map<string, OscSubscription>();
  private readonly devices = new Map<string, ResolvedDevice>();

  constructor(
    private readonly deliver: (subscriptionId: string, message: OscMessage) => void,
    private readonly resolve: HostResolver = resolveHost
  ) {}

  subscribe(subscription: OscSubscription): void {
    this.subscriptions.set(subscription.id, { ...subscription });
  }

  unsubscribe(id: string): void {
    this.subscriptions.delete(id);
  }

  /** Learns the IP addresses of the devices. Hostnames are resolved again only when the configured host changes. */
  async syncDevices(devices: readonly DeviceConfig[]): Promise<void> {
    const names = new Set(devices.map((device) => device.name));
    for (const name of this.devices.keys()) if (!names.has(name)) this.devices.delete(name);

    await Promise.all(
      devices.map(async ({ name, address }) => {
        if (this.devices.get(name)?.host === address) return;
        const resolved = await this.resolve(address).catch(() => []);
        this.devices.set(name, { host: address, addresses: new Set([address, ...resolved].map(normalizeAddress)) });
      })
    );
  }

  handle(sourceAddress: string, message: OscMessage): void {
    const source = normalizeAddress(sourceAddress);
    for (const subscription of this.subscriptions.values()) {
      if (subscription.path === message.path && this.devices.get(subscription.deviceName)?.addresses.has(source)) {
        this.deliver(subscription.id, message);
      }
    }
  }
}
