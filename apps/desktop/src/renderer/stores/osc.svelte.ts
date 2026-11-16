import { getItemDefinition } from '@soticaspar/core';
import { backend } from '../lib/backend';
import { frameBatcher } from '../lib/frame';
import { OscMonitor } from '../engine/oscMonitor';
import {
  IDLE_VIEW,
  applyOsc,
  emptyFileState,
  fpsPath,
  layerPath,
  oscKind,
  oscView,
  type OscFileState,
  type OscTimeView
} from '../engine/oscTime';
import type { TreeItem } from '../engine/tree';
import { app } from './app.svelte';

export const monitor = new OscMonitor(backend);

interface RowWatch {
  signature: string;
  item: TreeItem;
  state: OscFileState;
}

const num = (value: unknown): number => Number(value) || 0;

/**
 * OSC driven time/progress of the visible rundown rows. Only rows on screen are subscribed, messages only mark
 * a row dirty, and views are recomputed once per animation frame.
 */
class RowOsc {
  views = $state.raw<ReadonlyMap<string, OscTimeView>>(new Map());

  private readonly rows = new Map<string, RowWatch>();
  private readonly dirty = new Set<string>();
  private readonly batcher = frameBatcher(() => this.flush());
  private staleTimer: ReturnType<typeof setInterval> | undefined;

  viewOf(id: string): OscTimeView {
    return this.views.get(id) ?? IDLE_VIEW;
  }

  /** Declares which rows are on screen; everything else is unsubscribed. */
  setVisible(items: readonly TreeItem[]): void {
    const wanted = new Map(items.filter((i) => getItemDefinition(i.type)?.timeline && i.deviceName !== '').map((i) => [i.id, i]));

    for (const [id, row] of this.rows) {
      if (!wanted.has(id)) {
        monitor.clear(`row:${id}`);
        this.rows.delete(id);
        this.dirty.add(id);
      } else if (row.signature !== this.signatureOf(wanted.get(id) as TreeItem)) {
        this.rows.delete(id);
      }
    }
    for (const [id, item] of wanted) {
      const existing = this.rows.get(id);
      if (existing) {
        existing.item = item;
        continue;
      }
      const row: RowWatch = { signature: this.signatureOf(item), item, state: emptyFileState() };
      this.rows.set(id, row);
      this.subscribe(row);
      this.dirty.add(id);
    }
    this.batcher.schedule();
    this.ensureStaleTimer();
  }

  /** Calls back once the item's file shows up as playing on its layer (auto-play queues advance on that). */
  watchStart(item: TreeItem, onStarted: () => void): () => void {
    const owner = `start:${item.id}`;
    const state = emptyFileState();
    const channel = num(item.props.channel);
    const layer = num(item.props.videolayer);
    const handler = (kind: 'time' | 'name') => (message: { args: Array<string | number | boolean | null> }) => {
      applyOsc(state, kind, message.args, Date.now());
      const name = state.name.replace(/\.[^.]*$/, '').toLowerCase();
      if (state.time > 0 && name === item.name.toLowerCase()) {
        monitor.clear(owner);
        onStarted();
      }
    };
    monitor.sync(owner, [
      { deviceName: item.deviceName, path: layerPath(channel, layer, 'name'), handler: handler('name') },
      { deviceName: item.deviceName, path: layerPath(channel, layer, 'time'), handler: handler('time') }
    ]);
    return () => monitor.clear(owner);
  }

  private signatureOf(item: TreeItem): string {
    return `${item.deviceName}|${num(item.props.channel)}|${num(item.props.videolayer)}|${item.name}`;
  }

  private subscribe(row: RowWatch): void {
    const { item, state } = row;
    const channel = num(item.props.channel);
    const layer = num(item.props.videolayer);
    const on = (message: { path: string; args: Array<string | number | boolean | null> }): void => {
      const kind = oscKind(message.path);
      if (!kind) return;
      applyOsc(state, kind, message.args, Date.now());
      this.dirty.add(item.id);
      this.batcher.schedule();
    };
    const device = item.deviceName;
    monitor.sync(`row:${item.id}`, [
      { deviceName: device, path: layerPath(channel, layer, 'time'), handler: on },
      { deviceName: device, path: layerPath(channel, layer, 'clip'), handler: on },
      { deviceName: device, path: layerPath(channel, layer, 'name'), handler: on },
      { deviceName: device, path: layerPath(channel, layer, 'paused'), handler: on },
      { deviceName: device, path: layerPath(channel, layer, 'loop'), handler: on },
      { deviceName: device, path: fpsPath(channel), handler: on }
    ]);
  }

  private flush(): void {
    if (this.dirty.size === 0) return;
    const next = new Map(this.views);
    const now = Date.now();
    for (const id of this.dirty) {
      const row = this.rows.get(id);
      if (!row) {
        next.delete(id);
        continue;
      }
      next.set(
        id,
        oscView(row.state, {
          itemName: row.item.name,
          reverse: app.settings.reverseOscTime,
          dropFrame: app.settings.useDropFrameNotation,
          now
        })
      );
    }
    this.dirty.clear();
    this.views = next;
  }

  /** Rows that went silent must fall back to the idle view without waiting for another message. */
  private ensureStaleTimer(): void {
    if (this.staleTimer) return;
    this.staleTimer = setInterval(() => {
      for (const [id, view] of this.views) if (view.playing) this.dirty.add(id);
      if (this.dirty.size > 0) this.batcher.schedule();
    }, 250);
  }
}

export const rowOsc = new RowOsc();
