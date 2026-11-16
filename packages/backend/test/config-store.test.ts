import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '@soticaspar/core';
import type { DeviceConfig } from '@soticaspar/core';
import { ConfigStore } from '../src/config-store';
import { device as makeDevice, makeDataDir } from './helpers';

const noLog = () => undefined;

const device = (name: string, overrides: Partial<DeviceConfig> = {}): DeviceConfig => makeDevice(name, 5250, overrides);

async function openStore(dir: string): Promise<ConfigStore> {
  const store = new ConfigStore(dir, noLog);
  await store.load();
  return store;
}

describe('ConfigStore', () => {
  it('starts with defaults when nothing is stored', async () => {
    const store = await openStore(await makeDataDir());

    expect(store.settings()).toEqual(DEFAULT_SETTINGS);
    expect(store.devices()).toEqual([]);
    expect(store.openRecent()).toEqual([]);
  });

  it('merges stored settings with the defaults and drops invalid values', async () => {
    const dir = await makeDataDir();
    await writeFile(join(dir, 'settings.json'), JSON.stringify({ fontSize: 20, theme: 5, unknown: true, oscMonitorPort: null }));

    const settings = (await openStore(dir)).settings();

    expect(settings.fontSize).toBe(20);
    expect(settings.theme).toBe(DEFAULT_SETTINGS.theme);
    expect(settings.oscMonitorPort).toBe(DEFAULT_SETTINGS.oscMonitorPort);
    expect(settings).not.toHaveProperty('unknown');
  });

  it('keeps the default properties of clips and drops what is not a plain value', async () => {
    const dir = await makeDataDir();
    await writeFile(
      join(dir, 'settings.json'),
      JSON.stringify({ clipDefaults: { MOVIE: { loop: true, channel: 2, nested: { a: 1 }, nothing: null, text: 'x' }, STILL: 'nope', AUDIO: {} }, delayType: 'Timecode' })
    );

    const settings = (await openStore(dir)).settings();

    expect(settings.clipDefaults).toEqual({ MOVIE: { loop: true, channel: 2, text: 'x' } });
    expect(settings.delayType).toBe('Timecode');
    expect((await openStore(await makeDataDir())).settings().clipDefaults).toEqual({});
  });

  it('persists settings, devices, outputs and presets across restarts', async () => {
    const dir = await makeDataDir();
    const store = await openStore(dir);
    await store.updateSettings({ fontSize: 18 });
    await store.saveDevice(device('A', { description: 'main' }));
    await store.saveOscOutput({ name: 'O', address: '10.0.0.1', port: 9000, description: '' });
    await store.savePreset({ name: 'P', value: '<items/>' });

    const reopened = await openStore(dir);

    expect(reopened.settings().fontSize).toBe(18);
    expect(reopened.devices()).toEqual([device('A', { description: 'main' })]);
    expect(reopened.oscOutputs()).toHaveLength(1);
    expect(reopened.presets()).toEqual([{ name: 'P', value: '<items/>' }]);
  });

  it('survives corrupt files and keeps a copy of them', async () => {
    const dir = await makeDataDir();
    await writeFile(join(dir, 'devices.json'), '{ not json');
    await writeFile(join(dir, 'settings.json'), '[]');

    const store = await openStore(dir);

    expect(store.devices()).toEqual([]);
    expect(store.settings()).toEqual(DEFAULT_SETTINGS);
    expect(await readFile(join(dir, 'devices.json.corrupt'), 'utf8')).toBe('{ not json');
  });

  it('ignores invalid and duplicate device entries', async () => {
    const dir = await makeDataDir();
    await writeFile(
      join(dir, 'devices.json'),
      JSON.stringify([{ name: 'A', address: 'a', port: 1 }, { name: 'A', address: 'b' }, { name: '', address: 'c' }, { name: 'D' }, 'x'])
    );

    expect((await openStore(dir)).devices().map((d) => [d.name, d.address, d.port])).toEqual([['A', 'a', 1]]);
  });

  it('renames a device in place and rejects name clashes', async () => {
    const store = await openStore(await makeDataDir());
    await store.saveDevice(device('A'));
    await store.saveDevice(device('B'));

    await store.saveDevice(device('C'), 'A');
    expect(store.devices().map((d) => d.name)).toEqual(['C', 'B']);

    await expect(store.saveDevice(device('B'), 'C')).rejects.toThrow('already exists');
    await expect(store.saveDevice(device(' '))).rejects.toThrow('must not be empty');
  });

  it('removes entries', async () => {
    const store = await openStore(await makeDataDir());
    await store.saveDevice(device('A'));
    await store.removeDevice('A');
    await store.removeDevice('missing');

    expect(store.devices()).toEqual([]);
  });

  it('stores what the server reported about a device', async () => {
    const dir = await makeDataDir();
    const store = await openStore(dir);
    await store.saveDevice(device('A'));
    await store.updateDeviceInfo('A', { version: '2.3.3', channels: 2, channelFormats: 'PAL,PAL' });

    expect((await openStore(dir)).devices()[0]).toMatchObject({ version: '2.3.3', channels: 2, channelFormats: 'PAL,PAL' });
  });

  it('keeps the open recent list newest first, unique and bounded by the setting', async () => {
    const dir = await makeDataDir();
    const store = await openStore(dir);
    await store.updateSettings({ openRecent: 3 });
    for (const path of ['a', 'b', 'c', 'a', 'd']) await store.addOpenRecent(path);

    expect(store.openRecent()).toEqual(['d', 'a', 'c']);
    expect((await openStore(dir)).openRecent()).toEqual(['d', 'a', 'c']);

    await store.updateSettings({ openRecent: 1 });
    expect(store.openRecent()).toEqual(['d']);
  });

  it('serializes concurrent writes without losing updates', async () => {
    const dir = await makeDataDir();
    const store = await openStore(dir);
    await Promise.all(Array.from({ length: 20 }, (_, i) => store.saveDevice(device(`D${i}`))));

    expect((await openStore(dir)).devices()).toHaveLength(20);
  });
});
