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

/** The frame rate of a channel (25 when the device or its format is unknown). */
export function channelFps(device: DeviceConfig | undefined, channel: number): number {
  return framesPerSecond(channelFormats(device)[channel - 1] ?? '');
}

/**
 * Converts the delay/duration of an item to milliseconds (ItemScheduler.cpp). In frame and timecode mode (both
 * store frames) the fps of the channel's video format is used. Returns null when the channel does not exist on
 * the device.
 */
export function toMilliseconds(value: number, delayType: AppSettings['delayType'], device: DeviceConfig | undefined, channel: number): number | null {
  if (delayType === 'Milliseconds') return value;
  const formats = channelFormats(device);
  if (device && channel > formats.length) return null;
  // Rounded to the nearest millisecond: with the exact NTSC rates a truncation can land one millisecond early.
  return Math.round((value * 1000) / framesPerSecond(formats[channel - 1] ?? ''));
}
