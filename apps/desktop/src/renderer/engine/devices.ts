import { framesPerSecond, type AppSettings, type DeviceConfig, type DeviceTarget } from '@soticaspar/core';

export interface ResolvedTargets {
  main?: DeviceTarget;
  shadows: DeviceTarget[];
}

const target = (device: DeviceConfig): DeviceTarget => ({ name: device.name, previewChannel: device.previewChannel });

/** The item's own device plus every shadow device that mirrors the playout. */
export function resolveTargets(devices: readonly DeviceConfig[], deviceName: string): ResolvedTargets {
  const main = devices.find((d) => d.name === deviceName);
  return {
    main: main ? target(main) : undefined,
    shadows: devices.filter((d) => d.shadow && d.name !== deviceName).map(target)
  };
}

/** The video format name of each channel of a device, as reported in `DeviceConfig.channelFormats`. */
export function channelFormats(device: DeviceConfig | undefined): string[] {
  return device ? device.channelFormats.split(',').map((f) => f.trim()) : [];
}

/**
 * Converts the delay/duration of an item to milliseconds (ItemScheduler.cpp). In frame mode the fps of the
 * channel's video format is used. Returns null when the channel does not exist on the device.
 */
export function toMilliseconds(value: number, delayType: AppSettings['delayType'], device: DeviceConfig | undefined, channel: number): number | null {
  if (delayType === 'Milliseconds') return value;
  const formats = channelFormats(device);
  if (device && channel > formats.length) return null;
  const fps = framesPerSecond(formats[channel - 1] ?? '');
  return Math.trunc(value * (1000 / fps));
}
