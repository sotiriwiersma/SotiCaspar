/**
 * End-to-end check of the backend against a real CasparCG server (2.3+), using the same item
 * definitions and command builders as the app. Opt-in: `npm run test:live`.
 *
 * Environment:
 *   CASPAR_HOST   server address (default 127.0.0.1)
 *   CASPAR_PORT   AMCP port (default 5250)
 *   CASPAR_CLIP   media to play (default: the first MOVIE in the library)
 *   CASPAR_LAYER  layer used for playback (default 999, cleared afterwards)
 *
 * Plays the clip for a few seconds on channel 1 and clears the layer at the end.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { IDLE_STATE, amcp, buildCommands, createItem, getItemDefinition } from '@soticaspar/core';
import type { DeviceConfig, LibraryEntry, OscMessage } from '@soticaspar/core';
import { createBackend } from '../src';
import type { Backend } from '../src';

const HOST = process.env.CASPAR_HOST ?? '127.0.0.1';
const PORT = Number(process.env.CASPAR_PORT ?? 5250);
const LAYER = Number(process.env.CASPAR_LAYER ?? 999);
const DEVICE = 'Live';

const device: DeviceConfig = {
  name: DEVICE, address: HOST, port: PORT, username: '', password: '', description: 'live test',
  shadow: false, channels: 0, channelFormats: '', previewChannel: 0, lockedChannel: 0, version: ''
};

async function waitFor<T>(what: string, probe: () => Promise<T | undefined> | T | undefined, timeoutMs = 15_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await probe();
    if (value !== undefined) return value;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

describe(`live CasparCG at ${HOST}:${PORT}`, () => {
  let backend: Backend;
  let dataDir: string;
  let clip: LibraryEntry;

  beforeAll(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'soticaspar-live-'));
    backend = createBackend({ dataDir });
    // Thumbnails are only fetched while tooltips are enabled.
    await backend.setSettings({ showThumbnailTooltip: true, enableOscInputControl: false, enableOscInputWebSocket: false });
    await backend.saveDevice(device);
  });

  afterAll(async () => {
    await backend?.sendCustomCommand(DEVICE, amcp.clearVideolayer(1, LAYER)).catch(() => undefined);
    await backend?.dispose();
    await rm(dataDir, { recursive: true, force: true });
  });

  it('connects and reads version and channel layout', async () => {
    const status = await waitFor('connection', async () => (await backend.getDeviceStatuses()).find((s) => s.connected && s.version !== ''));
    expect(status.version).toMatch(/^\d+\.\d+/);
    expect(status.channels).toBeGreaterThan(0);
    const [stored] = await backend.listDevices();
    expect(stored.channelFormats.split(',')).toHaveLength(status.channels);
  });

  it('lists media with durations', async () => {
    const library = await waitFor('library', async () => {
      const entries = await backend.getLibrary();
      return entries.some((e) => e.type === 'MOVIE') ? entries : undefined;
    }, 30_000);

    const wanted = process.env.CASPAR_CLIP?.toUpperCase();
    clip = library.find((e) => e.type === 'MOVIE' && (!wanted || e.name.toUpperCase() === wanted))!;
    expect(clip, `clip ${wanted ?? '(any movie)'} in library`).toBeDefined();
    expect(clip.timecode).toMatch(/^\d{2}:\d{2}:\d{2}:\d{2}$/);
    expect(clip.timecode).not.toBe('00:00:00:00');
    expect(library.every((e) => e.deviceName === DEVICE && !e.name.includes('\\'))).toBe(true);
  });

  it('retrieves thumbnails', async () => {
    const withThumb = await waitFor('thumbnail', async () => (await backend.getLibrary()).find((e) => e.thumbnail !== ''), 30_000);
    expect(Buffer.from(withThumb.thumbnail, 'base64').subarray(1, 4).toString()).toBe('PNG');
  });

  it('plays a movie item and reports its time over OSC', async () => {
    const definition = getItemDefinition('MOVIE')!;
    const item = createItem('MOVIE', { name: clip.name, deviceName: DEVICE, props: { videolayer: LAYER, loop: true } });

    const received: OscMessage[] = [];
    const off = backend.on('osc-message', ({ subscriptionId, message }) => {
      if (subscriptionId === 'live-time') received.push(message);
    });
    await backend.oscSubscribe({ id: 'live-time', deviceName: DEVICE, path: `/channel/1/stage/layer/${LAYER}/foreground/file/time` });

    await backend.sendCommands(buildCommands(definition, item, 'play', IDLE_STATE, { main: { name: DEVICE, previewChannel: 0 }, shadows: [] }));
    // The first messages after PLAY report [0, 0] while the producer is still opening the file.
    const first = await waitFor('OSC file time', () => received.find((m) => Number(m.args[1]) > 0));
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const last = received[received.length - 1];

    off();
    await backend.oscUnsubscribe('live-time');

    expect(Number(last.args[0])).toBeGreaterThan(Number(first.args[0]));
  });

  it('pauses, resumes and clears the layer', async () => {
    // AMCP acknowledges before the change is applied on the next frame, so poll the layer state.
    const layerState = (pattern: RegExp) =>
      waitFor(`layer state ${pattern}`, async () => (pattern.test(await backend.sendCustomCommand(DEVICE, `INFO 1-${LAYER}`)) ? true : undefined), 3000);

    expect(await backend.sendCustomCommand(DEVICE, amcp.pause(1, LAYER))).toMatch(/^202 PAUSE OK/);
    await layerState(/<paused>true<\/paused>/);
    expect(await backend.sendCustomCommand(DEVICE, amcp.resume(1, LAYER))).toMatch(/^202 RESUME OK/);
    await layerState(/<paused>false<\/paused>/);
    expect(await backend.sendCustomCommand(DEVICE, amcp.clearVideolayer(1, LAYER))).toMatch(/^202 CLEAR OK/);
    await layerState(/^(?![\s\S]*<producer>ffmpeg<\/producer>)/);
  });

  it('reports AMCP errors for bad commands', async () => {
    expect(await backend.sendCustomCommand(DEVICE, 'PLAY 1-1 "THIS_CLIP_DOES_NOT_EXIST_123"')).toMatch(/^404/);
  });

  it.each([false, true])('streams channel 1 to the Live panel relay (key: %s)', async (key) => {
    const outputPorts = async () => ((await backend.sendCustomCommand(DEVICE, 'INFO 1')).match(/<port_\d+>/g) ?? []).length;
    const before = await outputPorts();

    const { url } = await backend.startLiveStream({ deviceName: DEVICE, channel: 1, key, large: false });
    const { WebSocket } = await import('ws');
    const socket = new WebSocket(url);
    let bytes = 0;
    let first: Buffer | undefined;
    socket.on('message', (data: Buffer) => {
      first ??= data;
      bytes += data.length;
    });
    await waitFor('stream data', () => (bytes > 50_000 ? true : undefined));
    expect(await outputPorts()).toBe(before + 1);
    socket.terminate();
    await backend.stopLiveStream();

    expect(first?.[0]).toBe(0x47); // MPEG-TS sync byte
    await waitFor('stream consumer removed', async () => ((await outputPorts()) === before ? true : undefined));
  });

  it('ends with the latest stream when switching quickly', async () => {
    const outputPorts = async () => ((await backend.sendCustomCommand(DEVICE, 'INFO 1')).match(/<port_\d+>/g) ?? []).length;
    const before = await outputPorts();
    // Like the Live panel switching from fill to key: the stop of the old stream and the new start overlap.
    const first = backend.startLiveStream({ deviceName: DEVICE, channel: 1, key: false, large: false });
    const stop = backend.stopLiveStream();
    const second = backend.startLiveStream({ deviceName: DEVICE, channel: 1, key: true, large: true });
    await Promise.all([first, stop]);
    const { url } = await second;

    const { WebSocket } = await import('ws');
    const socket = new WebSocket(url);
    let bytes = 0;
    socket.on('message', (data: Buffer) => (bytes += data.length));
    await waitFor('stream data after switching', () => (bytes > 50_000 ? true : undefined));
    expect(await outputPorts()).toBe(before + 1);
    socket.terminate();
    await backend.stopLiveStream();
    await waitFor('stream consumer removed', async () => ((await outputPorts()) === before ? true : undefined));
  });
});
