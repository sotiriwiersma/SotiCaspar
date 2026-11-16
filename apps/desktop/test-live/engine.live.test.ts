/**
 * The desktop rundown engine driving a real CasparCG server through the real backend, the same path the
 * UI takes for F1/F2/F3... Opt-in: `npm run test:live` (see packages/backend/test-live for the env vars).
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, createItem } from '@soticaspar/core';
import type { DeviceConfig, RundownItem } from '@soticaspar/core';
import { createBackend } from '@soticaspar/backend';
import type { Backend } from '@soticaspar/backend';
import { RundownEngine } from '../src/renderer/engine/engine';
import { RundownModel } from '../src/renderer/engine/rundownModel';
import { assignIds } from '../src/renderer/engine/tree';

const HOST = process.env.CASPAR_HOST ?? '127.0.0.1';
const PORT = Number(process.env.CASPAR_PORT ?? 5250);
const LAYER = Number(process.env.CASPAR_LAYER ?? 999);
const DEVICE = 'Live';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor<T>(what: string, probe: () => Promise<T | undefined>, timeoutMs = 10_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await probe();
    if (value !== undefined) return value;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`);
    await sleep(100);
  }
}

describe(`rundown engine on live CasparCG at ${HOST}:${PORT}`, () => {
  let backend: Backend;
  let dataDir: string;
  let devices: DeviceConfig[] = [];
  let clipName: string;
  const errors: string[] = [];
  const model = new RundownModel();
  let engine: RundownEngine;

  /** The last INFO of the layer: the live test reads the server state from it instead of OSC. */
  let lastInfo = '';
  const layerInfo = async () => (lastInfo = await backend.sendCustomCommand(DEVICE, `INFO 1-${LAYER}`));
  const section = (name: string) => new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(lastInfo)?.[1] ?? '';
  const serverState = () => {
    const foreground = section('foreground');
    const playing = /<producer>ffmpeg<\/producer>/.test(foreground);
    return { playing, paused: playing && /<paused>true<\/paused>/.test(foreground), loaded: /<producer>ffmpeg<\/producer>/.test(section('background')) };
  };
  const until = (what: string, pattern: RegExp, timeoutMs?: number) =>
    waitFor(what, async () => (pattern.test(await layerInfo()) ? true : undefined), timeoutMs);
  const noProducer = /^(?![\s\S]*<producer>ffmpeg<\/producer>)/;
  const mixer = (property: string) => backend.sendCustomCommand(DEVICE, `MIXER 1-${LAYER} ${property}`);
  /** Waits until the server reports `expected` for a mixer property (it formats numbers as `0.250000`). */
  const mixerUntil = (what: string, property: string, expected: number[]) =>
    waitFor(what, async () => {
      const values = (await mixer(property)).split('\r\n')[1]?.trim().split(/\s+/).map(Number) ?? [];
      return values.length === expected.length && values.every((v, i) => Math.abs(v - expected[i]) < 1e-4) ? true : undefined;
    });

  function load(items: RundownItem[]) {
    model.nodes = assignIds(items);
    return model.items();
  }

  beforeAll(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'soticaspar-live-engine-'));
    backend = createBackend({ dataDir });
    await backend.setSettings({ enableOscInputControl: false, enableOscInputWebSocket: false });
    await backend.saveDevice({
      name: DEVICE, address: HOST, port: PORT, username: '', password: '', description: '', shadow: false,
      channels: 0, channelFormats: '', previewChannel: 0, lockedChannel: 0, version: ''
    });
    devices = await waitFor('connected device', async () => {
      const list = await backend.listDevices();
      return list[0]?.channelFormats ? list : undefined;
    });
    const wanted = process.env.CASPAR_CLIP?.toUpperCase();
    clipName = await waitFor('a movie', async () =>
      (await backend.getLibrary()).find((e) => e.type === 'MOVIE' && (!wanted || e.name.toUpperCase() === wanted))?.name
    , 30_000);

    engine = new RundownEngine(model, {
      backend,
      devices: () => devices,
      settings: () => ({ ...DEFAULT_SETTINGS, delayType: 'Milliseconds' }),
      clock: { setTimeout: (run, ms) => setTimeout(run, ms), clearTimeout: (h) => clearTimeout(h as NodeJS.Timeout), now: () => Date.now() },
      serverState,
      watchStart: () => () => undefined,
      onDuration: () => undefined,
      runRundownCommand: () => undefined,
      commandsDisabled: () => false,
      onError: (message) => void errors.push(message),
      onChange: () => undefined
    });
  });

  afterAll(async () => {
    engine?.dispose();
    await backend?.sendCustomCommand(DEVICE, `CLEAR 1-${LAYER}`).catch(() => undefined);
    await backend?.sendCustomCommand(DEVICE, `MIXER 1-${LAYER} CLEAR`).catch(() => undefined);
    await backend?.dispose();
    await rm(dataDir, { recursive: true, force: true });
  });

  it('plays, pauses, resumes and stops a video item', async () => {
    const [clip] = load([createItem('MOVIE', { name: clipName, deviceName: DEVICE, props: { videolayer: LAYER } })]);
    model.select(clip.id, 'single');

    engine.trigger('Play');
    await until('playing', /<producer>ffmpeg<\/producer>/);

    engine.trigger('PauseResume');
    await until('paused', /<paused>true<\/paused>/);
    engine.trigger('PauseResume');
    await until('resumed', /<paused>false<\/paused>/);

    engine.trigger('Stop');
    await until('stopped', noProducer);
    expect(errors).toEqual([]);
  });

  it('honours delay and duration', async () => {
    const [clip] = load([createItem('MOVIE', { name: clipName, deviceName: DEVICE, props: { videolayer: LAYER, delay: 600, duration: 1500 } })]);
    model.select(clip.id, 'single');

    const started = Date.now();
    engine.trigger('Play');
    await sleep(300);
    expect(await layerInfo()).toMatch(noProducer);
    await until('delayed play', /<producer>ffmpeg<\/producer>/);
    expect(Date.now() - started).toBeGreaterThanOrEqual(550);
    await until('stopped after duration', noProducer, 5000);
    expect(Date.now() - started).toBeGreaterThanOrEqual(2000);
  });

  it('loads in the background and plays the loaded clip', async () => {
    const [clip] = load([createItem('MOVIE', { name: clipName, deviceName: DEVICE, props: { videolayer: LAYER } })]);
    model.select(clip.id, 'single');

    engine.trigger('Load');
    await until('loaded in background', /<background>[\s\S]*<producer>ffmpeg<\/producer>[\s\S]*<\/background>/);
    engine.trigger('PlayNow');
    await until('playing in foreground', /<foreground>[\s\S]*<producer>ffmpeg<\/producer>[\s\S]*<\/foreground>/);
    engine.trigger('ClearVideoLayer');
    await until('cleared', noProducer);
  });

  it('applies and resets mixer items', async () => {
    const [opacity, fill] = load([
      createItem('OPACITY', { deviceName: DEVICE, props: { videolayer: LAYER, opacity: 0.5 } }),
      createItem('FILL', { deviceName: DEVICE, props: { videolayer: LAYER, positionx: 0.25, positiony: 0.25, scalex: 0.5, scaley: 0.5 } })
    ]);

    model.select(opacity.id, 'single');
    engine.trigger('PlayNow');
    await mixerUntil('opacity 0.5', 'OPACITY', [0.5]);

    model.select(fill.id, 'single');
    engine.trigger('PlayNow');
    await mixerUntil('fill', 'FILL', [0.25, 0.25, 0.5, 0.5]);

    model.select(opacity.id, 'single');
    engine.trigger('Stop');
    await mixerUntil('opacity reset', 'OPACITY', [1]);
    expect(errors).toEqual([]);
  });
});
