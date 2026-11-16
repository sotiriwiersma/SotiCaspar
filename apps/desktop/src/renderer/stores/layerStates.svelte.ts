import type { OscMessage } from '@soticaspar/core';
import { frameBatcher } from '../lib/frame';
import { LIBRARY_TYPE_OF_ITEM } from '../lib/definitions';
import { EXTRA_LAYER_PATHS, applyLayerOsc, emptyLayer, serverState, type LayerSnapshot, type ServerState } from '../engine/layerState';
import { encodeLayer, type LayerTarget } from '../engine/nowPlaying';
import { STALE_MS, fpsPath, layerPath } from '../engine/oscTime';
import { isGroupNode, type TreeItem, type TreeNode } from '../engine/tree';
import { monitor } from './monitor';

const num = (value: unknown): number => Number(value) || 0;

/** The layer an item plays on. */
export const layerOf = (item: TreeItem): LayerTarget => ({ deviceName: item.deviceName, channel: num(item.props.channel), layer: num(item.props.videolayer) });

/** Items whose clip the server names in its OSC, so their state can be read per item (see `serverState`). */
const MEDIA_TYPES = new Set(['MOVIE', 'AUDIO', 'STILL', 'IMAGESCROLLER']);
export const hasMedia = (type: string): boolean => MEDIA_TYPES.has(type) && type in LIBRARY_TYPE_OF_ITEM;

/**
 * The server's own view of every layer the app cares about, kept up to date over OSC. This is the only playout
 * state the app has: what the rows show and what Play and Pause do follow the server, so changes made by other
 * programs (Companion, another client) are picked up.
 *
 * Owners declare the layers they need (`watch`); each layer is subscribed once however many owners want it.
 */
class LayerStates {
  /** Bumped (at most once per frame) when any layer changed: read it to make a computation reactive. */
  revision = $state(0);

  private readonly layers = new Map<string, LayerSnapshot>();
  private readonly owners = new Map<string, Set<string>>();
  private readonly subscribed = new Map<string, LayerTarget>();
  private readonly listeners = new Set<() => void>();
  private readonly batcher = frameBatcher(() => this.flush());
  private staleTimer: ReturnType<typeof setInterval> | undefined;
  private live = new Set<string>();

  /** Replaces the layers `owner` needs. */
  watch(owner: string, targets: readonly LayerTarget[]): void {
    const keys = new Set(targets.filter((t) => t.deviceName !== '' && t.channel > 0).map(encodeLayer));
    if (keys.size === 0) this.owners.delete(owner);
    else this.owners.set(owner, keys);
    const targetByKey = new Map(targets.map((t) => [encodeLayer(t), t]));

    const wanted = new Set([...this.owners.values()].flatMap((set) => [...set]));
    for (const key of [...this.subscribed.keys()]) {
      if (wanted.has(key)) continue;
      monitor.clear(`layer:${key}`);
      this.subscribed.delete(key);
      this.layers.delete(key);
    }
    for (const key of wanted) {
      if (this.subscribed.has(key)) continue;
      const target = targetByKey.get(key);
      if (target) this.subscribe(key, target);
    }
    this.staleTimer ??= setInterval(() => this.checkStale(), 100);
  }

  /** The latest report of a layer (empty when it was never reported). */
  get(target: LayerTarget): LayerSnapshot | undefined {
    return this.layers.get(encodeLayer(target));
  }

  /** The playout state of an item, from its layer. */
  stateOf(item: TreeItem): ServerState {
    return serverState(this.get(layerOf(item)), { name: item.name, media: hasMedia(item.type) }, Date.now());
  }

  /** Called once per frame in which a layer changed. */
  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private subscribe(key: string, target: LayerTarget): void {
    const layer = emptyLayer();
    this.layers.set(key, layer);
    this.subscribed.set(key, target);
    const on = (message: OscMessage): void => {
      if (applyLayerOsc(layer, message, Date.now())) this.batcher.schedule();
    };
    const { deviceName, channel, layer: number } = target;
    const at = (path: string) => ({ deviceName, path: `/channel/${channel}/stage/layer/${number}/${path}`, handler: on });
    monitor.sync(`layer:${key}`, [
      { deviceName, path: layerPath(channel, number, 'time'), handler: on },
      { deviceName, path: layerPath(channel, number, 'clip'), handler: on },
      { deviceName, path: layerPath(channel, number, 'name'), handler: on },
      { deviceName, path: layerPath(channel, number, 'paused'), handler: on },
      { deviceName, path: layerPath(channel, number, 'loop'), handler: on },
      at(EXTRA_LAYER_PATHS.producer),
      at(EXTRA_LAYER_PATHS.backgroundProducer),
      at(EXTRA_LAYER_PATHS.backgroundName),
      at(EXTRA_LAYER_PATHS.clipFps),
      { deviceName, path: fpsPath(channel), handler: on }
    ]);
  }

  /** A layer that went silent (cleared) must turn idle without waiting for another message. */
  private checkStale(): void {
    const now = Date.now();
    for (const key of this.live) {
      const layer = this.layers.get(key);
      if (!layer || now - layer.seen >= STALE_MS) {
        this.live.delete(key);
        this.batcher.schedule();
      }
    }
  }

  private flush(): void {
    const now = Date.now();
    for (const [key, layer] of this.layers) if (now - layer.seen < STALE_MS) this.live.add(key);
    this.revision++;
    for (const listener of this.listeners) listener();
  }
}

export const layerStates = new LayerStates();

/** Every item with a layer in `nodes`, groups included. */
export function itemLayers(nodes: readonly TreeNode[]): LayerTarget[] {
  const out: LayerTarget[] = [];
  const visit = (list: readonly TreeNode[]): void => {
    for (const node of list) {
      if (isGroupNode(node)) visit(node.items);
      else if (node.deviceName !== '' && 'videolayer' in node.props && 'channel' in node.props) out.push(layerOf(node));
    }
  };
  visit(nodes);
  return out;
}
