import { amcp } from '@soticaspar/core';
import type { LibraryEntry, LibraryType } from '@soticaspar/core';
import { isSuccess, parseMediaList, parseNameList, parseThumbnailList } from './amcp-parser';
import type { AmcpResponse, MediaInfo } from './amcp-parser';
import type { LogFn } from './events';
import type { JsonFile } from './json-file';
import type { ThumbnailCache } from './thumbnails';

interface DeviceLibrary {
  media: MediaInfo[];
  templates: string[];
  data: string[];
}

export interface LibraryOptions {
  send: (deviceName: string, command: string) => Promise<AmcpResponse>;
  /** Persists the media, template and data lists so that they are available while a device is offline. */
  file: JsonFile;
  thumbnails: ThumbnailCache;
  thumbnailsEnabled: () => boolean;
  /** Called when the entries returned by `entries()` have changed. */
  onChanged: () => void;
  log: LogFn;
}

const emptyLibrary = (): DeviceLibrary => ({ media: [], templates: [], data: [] });

const MEDIA_TYPES: readonly LibraryType[] = ['MOVIE', 'STILL', 'AUDIO'];

const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every((v) => typeof v === 'string');

function sanitize(raw: unknown): DeviceLibrary {
  const value = (typeof raw === 'object' && raw !== null ? raw : {}) as Partial<Record<keyof DeviceLibrary, unknown>>;
  const media = Array.isArray(value.media) ? (value.media as Array<Partial<MediaInfo>>) : [];
  return {
    media: media.filter(
      (m): m is MediaInfo => typeof m?.name === 'string' && typeof m.timecode === 'string' && MEDIA_TYPES.includes(m.type as LibraryType)
    ),
    templates: isStringArray(value.templates) ? value.templates : [],
    data: isStringArray(value.data) ? value.data : []
  };
}

/** The media, templates, data and thumbnails of all devices. */
export class Library {
  private readonly devices = new Map<string, DeviceLibrary>();
  private readonly refreshing = new Map<string, Promise<void>>();

  constructor(private readonly options: LibraryOptions) {}

  async load(): Promise<void> {
    const raw = await this.options.file.read();
    if (typeof raw !== 'object' || raw === null) return;
    for (const [deviceName, library] of Object.entries(raw)) this.devices.set(deviceName, sanitize(library));
  }

  flush(): Promise<void> {
    return this.options.file.flush();
  }

  /** Sorted by name, then device. */
  entries(): LibraryEntry[] {
    const entries: LibraryEntry[] = [];
    const add = (deviceName: string, type: LibraryType, name: string, timecode = '') => {
      const thumbnail = MEDIA_TYPES.includes(type) ? this.options.thumbnails.get(deviceName, name) : '';
      entries.push({ id: `${deviceName}|${type}|${name}`, deviceName, type, name, timecode, thumbnail });
    };

    for (const [deviceName, library] of this.devices) {
      for (const media of library.media) add(deviceName, media.type, media.name, media.timecode);
      for (const name of library.templates) add(deviceName, 'TEMPLATE', name);
      for (const name of library.data) add(deviceName, 'DATA', name);
    }
    return entries.sort((a, b) => compare(a.name, b.name) || compare(a.deviceName, b.deviceName) || compare(a.type, b.type));
  }

  /** Re-reads the library of one connected device. Concurrent calls for the same device share one run. */
  refreshDevice(deviceName: string): Promise<void> {
    const running = this.refreshing.get(deviceName);
    if (running) return running;

    const run = this.read(deviceName).finally(() => this.refreshing.delete(deviceName));
    this.refreshing.set(deviceName, run);
    return run;
  }

  async removeDevice(deviceName: string): Promise<void> {
    await this.options.thumbnails.removeDevice(deviceName);
    if (!this.devices.delete(deviceName)) return;
    this.persist();
    this.options.onChanged();
  }

  async retrieveData(deviceName: string, name: string): Promise<string> {
    const response = await this.options.send(deviceName, amcp.retrieveData(name));
    if (!isSuccess(response)) throw new Error(response.header);
    return response.body.join('\n');
  }

  private async read(deviceName: string): Promise<void> {
    const withThumbnails = this.options.thumbnailsEnabled();
    const [media, templates, data, thumbnails] = await Promise.all([
      this.list(deviceName, amcp.refreshMedia()),
      this.list(deviceName, amcp.refreshTemplate()),
      this.list(deviceName, amcp.refreshData()),
      withThumbnails ? this.list(deviceName, amcp.refreshThumbnails()) : undefined
    ]);

    const previous = this.devices.get(deviceName) ?? emptyLibrary();
    const next: DeviceLibrary = {
      media: media ? parseMediaList(media) : previous.media,
      templates: templates ? parseNameList(templates) : previous.templates,
      data: data ? parseNameList(data) : previous.data
    };
    if (JSON.stringify(next) !== JSON.stringify(previous)) {
      this.devices.set(deviceName, next);
      this.persist();
      this.options.onChanged();
    }

    if (!thumbnails) return;
    const changed = await this.options.thumbnails.sync(deviceName, parseThumbnailList(thumbnails), async (name) => {
      const response = await this.options.send(deviceName, amcp.retrieveThumbnail(name));
      return isSuccess(response) ? response.body[0] : undefined;
    });
    if (changed) this.options.onChanged();
  }

  /** The data lines of a list command, or undefined when the server did not provide them. */
  private async list(deviceName: string, command: string): Promise<string[] | undefined> {
    try {
      const response = await this.options.send(deviceName, command);
      if (isSuccess(response)) return response.body;
      this.options.log('warn', `${deviceName}: ${command} -> ${response.header}`);
    } catch (error) {
      this.options.log('debug', `${deviceName}: ${command} failed: ${String(error)}`);
    }
    return undefined;
  }

  private persist(): void {
    this.options.file.write(Object.fromEntries(this.devices)).catch((error) => this.options.log('error', `Cannot save library: ${String(error)}`));
  }
}

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
