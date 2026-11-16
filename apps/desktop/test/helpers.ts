import { DEFAULT_SETTINGS, IDLE_STATE, createItem, type DeviceCommands, type DeviceConfig, type ItemState, type PlayoutType, type RundownItem } from '@soticaspar/core';
import { RundownEngine, type EngineEnv, type EngineSettings } from '../src/renderer/engine/engine';
import { RundownModel } from '../src/renderer/engine/rundownModel';
import type { Clock } from '../src/renderer/engine/scheduler';
import { assignIds, type TreeItem } from '../src/renderer/engine/tree';

export class FakeClock implements Clock {
  time = 0;
  private nextHandle = 1;
  private readonly timers = new Map<number, { at: number; run: () => void }>();

  setTimeout(run: () => void, ms: number): unknown {
    const handle = this.nextHandle++;
    this.timers.set(handle, { at: this.time + ms, run });
    return handle;
  }

  clearTimeout(handle: unknown): void {
    this.timers.delete(handle as number);
  }

  now(): number {
    return this.time;
  }

  get pending(): number {
    return this.timers.size;
  }

  advance(ms: number): void {
    const target = this.time + ms;
    for (;;) {
      const due = [...this.timers.entries()].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      this.timers.delete(due[0]);
      this.time = due[1].at;
      due[1].run();
    }
    this.time = target;
  }
}

export const device = (name: string, overrides: Partial<DeviceConfig> = {}): DeviceConfig => ({
  name,
  address: '127.0.0.1',
  port: 5250,
  username: '',
  password: '',
  description: '',
  shadow: false,
  channels: 2,
  channelFormats: '1080p5000,PAL',
  previewChannel: 0,
  lockedChannel: 0,
  version: '',
  ...overrides
});

export interface Harness {
  model: RundownModel;
  engine: RundownEngine;
  clock: FakeClock;
  /** Flat list of `device: command` lines in the order they were sent. */
  sent: string[];
  batches: DeviceCommands[];
  effects: string[];
  durations: number[];
  rundownCommands: PlayoutType[];
  watchers: Map<string, () => void>;
  /** What the server reports per item id (idle when absent): set it to act as another program or the OSC feed. */
  server: Map<string, ItemState>;
  settings: EngineSettings;
  devices: DeviceConfig[];
}

export function harness(options: { devices?: DeviceConfig[]; settings?: Partial<EngineSettings> } = {}): Harness {
  const clock = new FakeClock();
  const sent: string[] = [];
  const batches: DeviceCommands[] = [];
  const effects: string[] = [];
  const durations: number[] = [];
  const rundownCommands: PlayoutType[] = [];
  const watchers = new Map<string, () => void>();
  const server = new Map<string, ItemState>();
  const settings: EngineSettings = {
    delayType: 'Milliseconds',
    markUsedItems: false,
    previewOnAutoStep: false,
    clearDelayedCommandsOnAutoStep: false,
    ...options.settings
  };
  const devices = options.devices ?? [device('A')];
  const model = new RundownModel();

  const record = (label: string) => async (...args: unknown[]) => void effects.push(`${label} ${args.map(String).join(' ')}`);
  const env: EngineEnv = {
    backend: {
      sendCommands: async (list) => {
        for (const batch of list) {
          batches.push(batch);
          for (const command of batch.commands) sent.push(`${batch.deviceName}: ${command}`);
        }
      },
      sendCustomCommand: async (deviceName, command) => {
        effects.push(`custom ${deviceName} ${command}`);
        return '202 OK';
      },
      sendOsc: record('osc'),
      sendHttp: async (request) => void effects.push(`http ${request.method} ${request.url}`),
      sendGpo: record('gpo')
    },
    devices: () => devices,
    settings: () => ({ ...DEFAULT_SETTINGS, ...settings }),
    clock,
    serverState: (item) => server.get(item.id) ?? IDLE_STATE,
    watchStart: (item, onStarted) => {
      watchers.set(item.id, onStarted);
      return () => watchers.delete(item.id);
    },
    onDuration: (ms) => durations.push(ms),
    runRundownCommand: (type) => rundownCommands.push(type),
    commandsDisabled: () => false,
    onError: (message) => {
      throw new Error(message);
    },
    onChange: () => undefined
  };

  return { model, engine: new RundownEngine(model, env), clock, sent, batches, effects, durations, rundownCommands, watchers, server, settings, devices };
}

export const movie = (name: string, props: Record<string, string | number | boolean> = {}, deviceName = 'A'): RundownItem =>
  createItem('MOVIE', { name, label: name, deviceName, props });

type GroupInit = { label?: string; autostep?: boolean; autoplay?: boolean; duration?: number; items: RundownItem[] };

/** Puts nodes into the harness' model: plain items, or `{ items, autostep... }` groups. */
export function fill(h: Harness, nodes: Array<RundownItem | GroupInit>): TreeItem[] {
  h.model.nodes = assignIds(
    nodes.map((n) =>
      'items' in n
        ? { type: 'GROUP' as const, label: n.label ?? 'Group', expanded: true, props: { autostep: n.autostep ?? false, autoplay: n.autoplay ?? false, duration: n.duration ?? 0, notes: '' }, items: n.items }
        : n
    )
  );
  return h.model.items();
}
