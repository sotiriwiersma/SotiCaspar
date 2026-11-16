import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { OscMessage } from '@soticaspar/core';
import type { AmcpResponse } from '../src/amcp-parser';
import { JsonFile } from '../src/json-file';
import { Library } from '../src/library';
import { OscRouter } from '../src/osc-router';
import { ServiceSlot } from '../src/service-slot';
import { ThumbnailCache } from '../src/thumbnails';
import { device, makeDataDir } from './helpers';

const noLog = () => undefined;

const reply = (header: string, ...body: string[]): AmcpResponse => ({ code: Number.parseInt(header, 10), header, body, raw: [header, ...body].join('\r\n') });

const RESPONSES: Record<string, AmcpResponse> = {
  CLS: reply('200 CLS OK', '"AMB"  MOVIE  6445960 20121101160514 643 1/25', '"LOGO"  STILL  1234 20121101150514'),
  TLS: reply('200 TLS OK', '"LOWERTHIRD"'),
  'DATA LIST': reply('200 DATA LIST OK', 'MYDATA'),
  'THUMBNAIL LIST': reply('200 THUMBNAIL LIST OK', '"AMB"  20121101160514 123', '"LOGO"  20121101150514 55'),
  'THUMBNAIL RETRIEVE "AMB"': reply('201 THUMBNAIL RETRIEVE OK', 'QUJD'),
  'THUMBNAIL RETRIEVE "LOGO"': reply('404 THUMBNAIL RETRIEVE FAILED'),
  'DATA RETRIEVE "MYDATA"': reply('201 DATA RETRIEVE OK', '<templateData/>')
};

async function createLibrary(dir: string, send = async (_device: string, command: string) => RESPONSES[command] ?? reply('400 ERROR', 'UNKNOWN')) {
  const onChanged = vi.fn();
  const sent: string[] = [];
  const thumbnails = new ThumbnailCache(join(dir, 'thumbnails'), noLog);
  const library = new Library({
    send: (device, command) => {
      sent.push(`${device}:${command}`);
      return send(device, command);
    },
    file: new JsonFile(join(dir, 'library.json'), noLog),
    thumbnails,
    thumbnailsEnabled: () => true,
    onChanged,
    log: noLog
  });
  await library.load();
  return { library, onChanged, sent, thumbnails };
}

describe('Library', () => {
  it('aggregates media, templates and data of a device with thumbnails', async () => {
    const { library, onChanged } = await createLibrary(await makeDataDir());
    await library.refreshDevice('A');

    expect(library.entries()).toEqual([
      { id: 'A|MOVIE|AMB', deviceName: 'A', type: 'MOVIE', name: 'AMB', timecode: '00:00:25:18', thumbnail: 'QUJD' },
      { id: 'A|STILL|LOGO', deviceName: 'A', type: 'STILL', name: 'LOGO', timecode: '', thumbnail: '' },
      { id: 'A|TEMPLATE|LOWERTHIRD', deviceName: 'A', type: 'TEMPLATE', name: 'LOWERTHIRD', timecode: '', thumbnail: '' },
      { id: 'A|DATA|MYDATA', deviceName: 'A', type: 'DATA', name: 'MYDATA', timecode: '', thumbnail: '' }
    ]);
    expect(onChanged).toHaveBeenCalled();
  });

  it('merges several devices, sorted by name and device', async () => {
    const { library } = await createLibrary(await makeDataDir());
    await library.refreshDevice('B');
    await library.refreshDevice('A');

    expect(library.entries().filter((e) => e.name === 'AMB').map((e) => e.deviceName)).toEqual(['A', 'B']);
  });

  it('keeps the previous list when the server fails a command and does not report unchanged results', async () => {
    const dir = await makeDataDir();
    let failMedia = false;
    const { library, onChanged } = await createLibrary(dir, async (_d, command) =>
      failMedia && command === 'CLS' ? reply('500 CLS FAILED') : (RESPONSES[command] ?? reply('400 ERROR', 'UNKNOWN'))
    );
    await library.refreshDevice('A');
    onChanged.mockClear();

    await library.refreshDevice('A');
    expect(onChanged).not.toHaveBeenCalled();

    failMedia = true;
    await library.refreshDevice('A');
    expect(library.entries().some((e) => e.type === 'MOVIE')).toBe(true);
  });

  it('shares a running refresh of the same device', async () => {
    const { library, sent } = await createLibrary(await makeDataDir());
    await Promise.all([library.refreshDevice('A'), library.refreshDevice('A')]);

    expect(sent.filter((s) => s === 'A:CLS')).toHaveLength(1);
  });

  it('persists the library so that offline devices keep their entries', async () => {
    const dir = await makeDataDir();
    const first = await createLibrary(dir);
    await first.library.refreshDevice('A');
    await first.library.flush();

    const second = await createLibrary(dir);
    await second.thumbnails.load();
    expect(second.library.entries().map((e) => e.name).sort()).toEqual(['AMB', 'LOGO', 'LOWERTHIRD', 'MYDATA']);
  });

  it('removes a device with its thumbnails', async () => {
    const dir = await makeDataDir();
    const { library, onChanged } = await createLibrary(dir);
    await library.refreshDevice('A');
    onChanged.mockClear();

    await library.removeDevice('A');

    expect(library.entries()).toEqual([]);
    expect(onChanged).toHaveBeenCalledOnce();
    expect(await readdir(join(dir, 'thumbnails'))).toEqual([]);
  });

  it('retrieves template data', async () => {
    const { library } = await createLibrary(await makeDataDir());
    expect(await library.retrieveData('A', 'MYDATA')).toBe('<templateData/>');
    await expect(library.retrieveData('A', 'MISSING')).rejects.toThrow('400 ERROR');
  });
});

describe('ThumbnailCache', () => {
  const listed = [{ name: 'AMB', timestamp: '1', size: '10' }];

  it('downloads changed thumbnails only and forgets removed ones', async () => {
    const dir = await makeDataDir();
    const cache = new ThumbnailCache(join(dir, 'thumbnails'), noLog);
    const retrieve = vi.fn(async (name: string) => `data-${name}`);

    expect(await cache.sync('A', listed, retrieve)).toBe(true);
    expect(await cache.sync('A', listed, retrieve)).toBe(false);
    expect(retrieve).toHaveBeenCalledTimes(1);

    await cache.sync('A', [{ ...listed[0], timestamp: '2' }], retrieve);
    expect(retrieve).toHaveBeenCalledTimes(2);

    expect(await cache.sync('A', [], retrieve)).toBe(true);
    expect(cache.get('A', 'AMB')).toBe('');
  });

  it('reloads thumbnails from disk', async () => {
    const dir = await makeDataDir();
    await new ThumbnailCache(join(dir, 'thumbnails'), noLog).sync('A', listed, async () => 'QUJD');

    const reloaded = new ThumbnailCache(join(dir, 'thumbnails'), noLog);
    await reloaded.load();
    const retrieve = vi.fn();

    expect(reloaded.get('A', 'AMB')).toBe('QUJD');
    expect(await reloaded.sync('A', listed, retrieve)).toBe(false);
    expect(retrieve).not.toHaveBeenCalled();
  });

  it('keeps what it has when the connection fails half way', async () => {
    const cache = new ThumbnailCache(join(await makeDataDir(), 'thumbnails'), noLog);
    const two = [...listed, { name: 'WIPE', timestamp: '1', size: '10' }];

    const changed = await cache.sync('A', two, async (name) => {
      if (name === 'WIPE') throw new Error('Connection closed');
      return 'QUJD';
    });

    expect(changed).toBe(true);
    expect(cache.get('A', 'AMB')).toBe('QUJD');
    expect(cache.get('A', 'WIPE')).toBe('');
  });
});

describe('OscRouter', () => {
  const message = (path: string): OscMessage => ({ path, args: [1] });
  const devices = [device('Main', 5250, { address: 'caspar.local' })];

  async function createRouter() {
    const delivered: Array<[string, OscMessage]> = [];
    const resolve = vi.fn(async () => ['10.0.0.5']);
    const router = new OscRouter((id, m) => delivered.push([id, m]), resolve);
    await router.syncDevices(devices);
    return { router, delivered, resolve };
  }

  it('delivers messages of the subscribed device and path', async () => {
    const { router, delivered } = await createRouter();
    router.subscribe({ id: 's1', deviceName: 'Main', path: '/channel/1/framerate' });

    router.handle('10.0.0.5', message('/channel/1/framerate'));
    router.handle('::ffff:10.0.0.5', message('/channel/1/framerate'));
    router.handle('10.0.0.6', message('/channel/1/framerate'));
    router.handle('10.0.0.5', message('/channel/2/framerate'));
    router.handle('10.0.0.5', message('/channel/1/framerate/extra'));

    expect(delivered.map(([id]) => id)).toEqual(['s1', 's1']);
  });

  it('stops delivering after unsubscribing and resolves hosts once', async () => {
    const { router, delivered, resolve } = await createRouter();
    router.subscribe({ id: 's1', deviceName: 'Main', path: '/a' });
    router.unsubscribe('s1');
    router.handle('10.0.0.5', message('/a'));
    await router.syncDevices(devices);

    expect(delivered).toEqual([]);
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it('still matches a device whose host cannot be resolved by its literal address', async () => {
    const delivered: string[] = [];
    const router = new OscRouter((id) => delivered.push(id), async () => Promise.reject(new Error('ENOTFOUND')));
    await router.syncDevices([device('Main', 5250, { address: '192.168.1.9' })]);
    router.subscribe({ id: 's1', deviceName: 'Main', path: '/a' });
    router.handle('192.168.1.9', message('/a'));

    expect(delivered).toEqual(['s1']);
  });
});

describe('ServiceSlot', () => {
  function createSlot() {
    const events: string[] = [];
    const slot = new ServiceSlot(
      'test',
      (port) => ({
        start: async () => {
          if (port === 666) throw new Error('in use');
          events.push(`start ${port}`);
        },
        stop: async () => void events.push(`stop ${port}`)
      }),
      noLog
    );
    return { slot, events };
  }

  it('starts, restarts on a new port and stops', async () => {
    const { slot, events } = createSlot();
    await slot.apply(true, 1);
    await slot.apply(true, 1);
    await slot.apply(true, 2);
    await slot.apply(false, 2);

    expect(events).toEqual(['start 1', 'stop 1', 'start 2', 'stop 2']);
  });

  it('survives a service that cannot start', async () => {
    const { slot, events } = createSlot();
    await slot.apply(true, 666);
    await slot.apply(true, 1);

    expect(events).toEqual(['start 1']);
  });
});
