import { parseXml, type DeviceConfig } from '@soticaspar/core';

type Raw = Record<string, unknown>;

const isRaw = (value: unknown): value is Raw => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (raw: Raw, key: string, fallback = ''): string => (typeof raw[key] === 'string' ? (raw[key] as string) : fallback);
const int = (raw: Raw, key: string): number => Number.parseInt(text(raw, key, '0'), 10) || 0;

/** Parses the server list exported by the Qt client (`<servers><device>...</device></servers>`). */
export function parseDeviceImport(xml: string): DeviceConfig[] {
  const root = parseXml(xml).servers;
  if (!isRaw(root)) throw new Error('Not a server list: missing <servers> element');

  const devices: DeviceConfig[] = [];
  for (const value of Object.values(root)) {
    for (const raw of Array.isArray(value) ? value : [value]) {
      if (!isRaw(raw) || text(raw, 'name') === '') continue;
      devices.push({
        name: text(raw, 'name'),
        address: text(raw, 'address'),
        port: int(raw, 'port') || 5250,
        username: text(raw, 'username'),
        password: text(raw, 'password'),
        description: text(raw, 'description'),
        shadow: text(raw, 'shadow', 'No').toLowerCase() === 'yes' || text(raw, 'shadow') === 'true',
        channels: 0,
        channelFormats: '',
        previewChannel: int(raw, 'previewchannel'),
        lockedChannel: int(raw, 'lockedchannel'),
        version: ''
      });
    }
  }
  return devices;
}
