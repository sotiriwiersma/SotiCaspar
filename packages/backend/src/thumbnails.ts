import { createHash } from 'node:crypto';
import { readdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { ThumbnailInfo } from './amcp-parser';
import type { LogFn } from './events';
import { writeFileAtomic } from './json-file';

interface StoredThumbnail extends ThumbnailInfo {
  deviceName: string;
  /** Base64 PNG. */
  data: string;
}

const isStored = (value: unknown): value is StoredThumbnail => {
  const v = value as Partial<Record<keyof StoredThumbnail, unknown>> | null;
  return typeof v === 'object' && v !== null && ['deviceName', 'name', 'timestamp', 'size', 'data'].every((key) => typeof v[key as keyof StoredThumbnail] === 'string');
};

/**
 * Thumbnails retrieved from the servers, kept on disk (one JSON file per thumbnail) so they do not have to
 * be downloaded again. A thumbnail is current while the server reports the same timestamp and size.
 */
export class ThumbnailCache {
  private readonly byDevice = new Map<string, Map<string, StoredThumbnail>>();

  constructor(
    private readonly dir: string,
    private readonly log: LogFn
  ) {}

  async load(): Promise<void> {
    const files = await readdir(this.dir).catch(() => [] as string[]);
    await Promise.all(
      files
        .filter((file) => file.endsWith('.json'))
        .map(async (file) => {
          try {
            const stored: unknown = JSON.parse(await readFile(join(this.dir, file), 'utf8'));
            if (isStored(stored)) this.deviceMap(stored.deviceName).set(stored.name, stored);
            else await rm(join(this.dir, file), { force: true });
          } catch {
            this.log('warn', `Ignoring unreadable thumbnail ${file}`);
          }
        })
    );
  }

  /** Base64 PNG, empty when there is none. */
  get(deviceName: string, name: string): string {
    return this.byDevice.get(deviceName)?.get(name)?.data ?? '';
  }

  /**
   * Brings the cache of a device in line with the server's thumbnail list: forgets thumbnails that no longer
   * exist and downloads new or changed ones one at a time. Resolves with whether anything changed.
   */
  async sync(deviceName: string, listed: readonly ThumbnailInfo[], retrieve: (name: string) => Promise<string | undefined>): Promise<boolean> {
    const cached = this.deviceMap(deviceName);
    const listedNames = new Set(listed.map((info) => info.name));
    let changed = false;

    for (const name of [...cached.keys()]) {
      if (listedNames.has(name)) continue;
      await this.forget(deviceName, name);
      changed = true;
    }

    try {
      for (const info of listed) {
        const current = cached.get(info.name);
        if (current?.timestamp === info.timestamp && current.size === info.size) continue;

        const data = await retrieve(info.name);
        if (!data) continue;
        await this.store({ ...info, deviceName, data });
        changed = true;
      }
    } catch (error) {
      this.log('warn', `Thumbnail download from ${deviceName} stopped: ${String(error)}`);
    }
    return changed;
  }

  async removeDevice(deviceName: string): Promise<void> {
    const cached = this.byDevice.get(deviceName);
    if (!cached) return;
    await Promise.all([...cached.keys()].map((name) => this.forget(deviceName, name)));
    this.byDevice.delete(deviceName);
  }

  private deviceMap(deviceName: string): Map<string, StoredThumbnail> {
    let map = this.byDevice.get(deviceName);
    if (!map) {
      map = new Map();
      this.byDevice.set(deviceName, map);
    }
    return map;
  }

  private file(deviceName: string, name: string): string {
    return join(this.dir, `${createHash('sha1').update(`${deviceName}\n${name}`).digest('hex')}.json`);
  }

  private async store(thumbnail: StoredThumbnail): Promise<void> {
    this.deviceMap(thumbnail.deviceName).set(thumbnail.name, thumbnail);
    await writeFileAtomic(this.file(thumbnail.deviceName, thumbnail.name), JSON.stringify(thumbnail));
  }

  private async forget(deviceName: string, name: string): Promise<void> {
    this.byDevice.get(deviceName)?.delete(name);
    await rm(this.file(deviceName, name), { force: true });
  }
}
