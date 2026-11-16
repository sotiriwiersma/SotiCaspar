import { getItemDefinition } from '@soticaspar/core';
import { IDLE_VIEW, applyOsc, emptyFileState, layerPath, oscView, type OscTimeView } from '../engine/oscTime';
import type { TreeItem } from '../engine/tree';
import { app } from './app.svelte';
import { layerOf, layerStates } from './layerStates.svelte';
import { monitor } from './monitor';

export { monitor };

const num = (value: unknown): number => Number(value) || 0;

/**
 * Time and progress of the visible rundown rows, from the server's report of their layers (`layerStates`).
 * Views are only computed for rows on screen, once per frame in which a layer changed.
 */
class RowOsc {
  views = $state.raw<ReadonlyMap<string, OscTimeView>>(new Map());

  private visible = new Map<string, TreeItem>();

  constructor() {
    layerStates.onChange(() => this.flush());
  }

  viewOf(id: string): OscTimeView {
    return this.views.get(id) ?? IDLE_VIEW;
  }

  /** Declares which rows are on screen. Their layers are watched with every other item of the rundowns. */
  setVisible(items: readonly TreeItem[]): void {
    this.visible = new Map(items.filter((i) => getItemDefinition(i.type)?.timeline && i.deviceName !== '').map((i) => [i.id, i]));
    this.flush();
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

  private flush(): void {
    const next = new Map<string, OscTimeView>();
    const now = Date.now();
    for (const [id, item] of this.visible) {
      const layer = layerStates.get(layerOf(item));
      if (!layer) continue;
      const view = oscView(layer, { itemName: item.name, reverse: app.settings.reverseOscTime, dropFrame: app.settings.useDropFrameNotation, now });
      if (view.playing) next.set(id, view);
    }
    // Rows only re-render when something they show changed.
    if (next.size === 0 && this.views.size === 0) return;
    this.views = next;
  }
}

export const rowOsc = new RowOsc();
