import {
  buildCommands,
  buildEffects,
  getItemDefinition,
  resolveTrigger,
  SCHEDULED_END,
  STOPPING_OPS,
  type AnyItemDefinition,
  type AppSettings,
  type BackendApi,
  type BaseProps,
  type DeviceConfig,
  type DeviceTarget,
  type ItemState,
  type PlayoutOp,
  type PlayoutType,
  type SideEffect
} from '@soticaspar/core';
import { resolveTargets, toMilliseconds } from './devices';
import type { RundownModel } from './rundownModel';
import { Scheduler, type Clock, type Step } from './scheduler';
import { isGroupNode, locate, type TreeGroup, type TreeItem, type TreeNode } from './tree';

/** Colour of the "executed" flash of a row: green for play, red for stop and clear, blue for everything else. */
export type FlashKind = 'play' | 'stop' | 'other';

/**
 * What the app remembers about an item. Not its playout state: whether an item is playing, paused or loaded is
 * always asked of the server (`EngineEnv.serverState`), so changes by other programs are respected.
 */
export interface ItemRuntime {
  /** Marked as used (dimmed row). */
  used: boolean;
  /** Incremented on every trigger, restarts the "executed" flash of the row. */
  flash: number;
  /** What the last trigger did, which picks the colour of the flash. */
  flashKind: FlashKind;
  /** When the last trigger happened (ms). A row that is created later (moved, scrolled into view) does not flash. */
  flashAt: number;
}

const IDLE: Readonly<ItemRuntime> = { used: false, flash: 0, flashKind: 'other', flashAt: 0 };

export type EngineSettings = Pick<AppSettings, 'delayType' | 'markUsedItems' | 'previewOnAutoStep' | 'clearDelayedCommandsOnAutoStep'>;

export interface EngineEnv {
  backend: Pick<BackendApi, 'sendCommands' | 'sendCustomCommand' | 'sendOsc' | 'sendHttp' | 'sendGpo'>;
  devices(): readonly DeviceConfig[];
  settings(): EngineSettings;
  clock: Clock;
  /** Whether the item is loaded, playing or paused, as its layer on the server reports it (OSC). */
  serverState(item: TreeItem): ItemState;
  /** Notifies when an item's media has started on the server (OSC); returns the unsubscribe. */
  watchStart(item: TreeItem, onStarted: () => void): () => void;
  /** Group durations feed the duration panel (0 resets it). */
  onDuration(ms: number): void;
  /** PLAYOUTCOMMAND items trigger the active rundown. */
  runRundownCommand(type: PlayoutType): void;
  /** The "disable commands" toggle of the inspector: AMCP is skipped but state is still tracked. */
  commandsDisabled(): boolean;
  onError(message: string): void;
  onChange(): void;
}

const flag = (props: TreeNode['props'], key: string): boolean => props[key] === true || props[key] === 'true';
const base = (item: TreeItem): BaseProps => item.props as unknown as BaseProps;
const isClear = (type: PlayoutType): boolean => type === 'Clear' || type === 'ClearVideoLayer' || type === 'ClearChannel';
const flashKindOf = (type: PlayoutType): FlashKind =>
  type === 'Play' || type === 'PlayNow' ? 'play' : type === 'Stop' || isClear(type) ? 'stop' : 'other';

type TimerKind = 'item' | 'update' | 'preview';

/**
 * The Qt ItemScheduler keeps a delayed play (with its stop) and a delayed update on separate timers, and a
 * delayed preview on a second scheduler. Every timer of an item is cancelled by stop and clear triggers.
 */
const TIMER_SUFFIX: Readonly<Record<TimerKind, string>> = { item: '', update: ':update', preview: ':preview' };
const timerKey = (id: string, kind: TimerKind): string => `${id}${TIMER_SUFFIX[kind]}`;
const timerKind = (op: PlayoutOp): TimerKind => (op === 'update' ? 'update' : op === 'preview' ? 'preview' : 'item');

/**
 * Executes playout triggers on the items of one rundown. Port of RundownTreeWidget::executeCommand plus the
 * per item `executeCommand` of the Qt rundown widgets, on top of the shared core playout functions.
 */
export class RundownEngine {
  private readonly runtimes = new Map<string, ItemRuntime>();
  private readonly scheduler: Scheduler;
  private readonly startWatches = new Map<string, () => void>();
  private autoPlayQueues: string[][] = [];
  private currentAutoPlayId: string | null = null;
  private playingId: string | null = null;
  private autoStepId: string | null = null;
  private rundownCommandDepth = 0;
  private readonly unsubscribe: () => void;

  constructor(
    readonly model: RundownModel,
    private readonly env: EngineEnv
  ) {
    this.scheduler = new Scheduler(env.clock);
    this.unsubscribe = model.subscribe(() => this.prune());
  }

  dispose(): void {
    this.unsubscribe();
    this.reset();
  }

  /** Forgets all playout state (reloading a rundown). */
  reset(): void {
    this.scheduler.cancelAll();
    for (const stop of this.startWatches.values()) stop();
    this.startWatches.clear();
    this.runtimes.clear();
    this.autoPlayQueues = [];
    this.currentAutoPlayId = null;
    this.playingId = null;
    this.autoStepId = null;
    this.env.onChange();
  }

  runtime(id: string): Readonly<ItemRuntime> {
    return this.runtimes.get(id) ?? IDLE;
  }

  /** The row shows the green activity bar: it is the current row or the last triggered one. */
  isActive(id: string): boolean {
    return id === this.model.current || id === this.playingId || id === this.autoStepId;
  }

  /**
   * The video that plays on the server and was triggered here last: what the countdown bar follows. A video another
   * program started counts too, after the ones triggered here.
   */
  latestPlayingVideo(): TreeItem | null {
    let best: TreeItem | null = null;
    let bestAt = -Infinity;
    const visit = (nodes: readonly TreeNode[]): void => {
      for (const node of nodes) {
        if (isGroupNode(node)) {
          visit(node.items);
          continue;
        }
        if (getItemDefinition(node.type)?.timeline !== true) continue;
        const at = this.runtime(node.id).flashAt;
        if (at > bestAt && this.env.serverState(node).playing) {
          best = node;
          bestAt = at;
        }
      }
    };
    visit(this.model.nodes);
    return best;
  }

  /** Runs `type` on `itemId` (default: the current node) with the full group / auto-step semantics. */
  trigger(type: PlayoutType, itemId: string | null = this.model.current): void {
    if (itemId === null) return;
    const found = locate(this.model.nodes, itemId);
    if (!found) return;
    const { node, parent } = found;

    if (type === 'Next' && parent && flag(parent.props, 'autoplay')) {
      this.autoPlayNext();
      return;
    }

    this.playingId = itemId;
    this.executeNode(node, type);

    if (isGroupNode(node)) this.runGroup(node, type);
    else if (parent && type === 'Play' && flag(parent.props, 'autoplay')) this.queueFrom(parent, node.id);
    this.env.onChange();
  }

  /** Runs `type` on the node only (remote control of single items): no group or auto-step handling. */
  executeDirect(type: PlayoutType, itemId: string): void {
    const node = this.model.node(itemId);
    if (!node) return;
    this.executeNode(node, type);
    this.env.onChange();
  }

  setUsed(ids: Iterable<string>, used: boolean): void {
    for (const id of ids) {
      const node = this.model.node(id);
      if (!node) continue;
      this.patch(id, { used });
      if (isGroupNode(node)) for (const child of node.items) this.patch(child.id, { used });
    }
    this.env.onChange();
  }

  setAllUsed(used: boolean): void {
    for (const id of this.model.ids()) this.patch(id, { used });
    this.env.onChange();
  }

  /** Cancels the delayed commands of the last auto-stepped group and resets its items. */
  clearDelayedCommands(): void {
    const group = this.autoStepId === null ? undefined : this.model.node(this.autoStepId);
    if (!group || !isGroupNode(group)) return;
    for (const child of group.items) {
      this.cancelTimers(child.id);
    }
  }

  // ---------------------------------------------------------------- group semantics

  private runGroup(group: TreeGroup, type: PlayoutType): void {
    const autoPlay = flag(group.props, 'autoplay');
    const autoStep = flag(group.props, 'autostep');
    const settings = this.env.settings();

    if (type === 'Next' && autoPlay) {
      if (this.currentAutoPlayId !== null) this.autoPlayNext();
    } else if (type === 'PauseResume' && autoPlay) {
      if (this.currentAutoPlayId !== null) this.executeById(this.currentAutoPlayId, type);
    } else if ((type === 'Play' || type === 'Load') && autoPlay) {
      this.startAutoPlayGroup(group, type);
    } else {
      if (settings.clearDelayedCommandsOnAutoStep && autoStep && type === 'Play') {
        this.clearDelayedCommands();
        this.autoStepId = group.id;
      }
      for (const child of group.items) {
        this.removeFromQueues(child.id);
        this.executeNode(child, type);
      }
      if (type === 'Preview') return;
    }

    if (autoStep && !isClear(type)) {
      const moved = this.model.stepCurrent(1);
      if (moved && settings.previewOnAutoStep && type === 'Play') this.trigger('Preview');
    }
  }

  /** Group with AutoPlay: the first autoplay video starts, the following ones are cued behind it through the queue. */
  private startAutoPlayGroup(group: TreeGroup, type: 'Play' | 'Load'): void {
    const queue: string[] = [];
    let first = true;
    for (const child of group.items) {
      const autoPlay = this.definitionOf(child)?.autoPlay;
      if (autoPlay) {
        if (!autoPlay(child.props)) continue;
        if (first) {
          this.executeNode(child, type);
          if (type === 'Load') break;
          this.currentAutoPlayId = child.id;
        }
        queue.push(child.id);
        first = false;
      } else {
        this.executeNode(child, type);
      }
    }
    if (queue.length > 0) this.autoPlayQueues.push(queue);
  }

  /** Playing one item of an AutoPlay group queues it and the autoplay videos below it. */
  private queueFrom(group: TreeGroup, itemId: string): void {
    const start = group.items.findIndex((c) => c.id === itemId);
    const queue = group.items
      .slice(start)
      .filter((c) => this.definitionOf(c)?.autoPlay?.(c.props))
      .map((c) => c.id);
    this.autoPlayQueues.push(queue);
  }

  /** The item at the head of the queue reported playback: remove it and start the next one. */
  private autoPlayStarted(itemId: string): void {
    const queue = this.autoPlayQueues.find((q) => q.includes(itemId));
    if (!queue) return;
    queue.shift();
    if (queue.length === 0) {
      this.autoPlayQueues = this.autoPlayQueues.filter((q) => q !== queue);
    } else {
      this.executeById(queue[0], 'Play');
      this.currentAutoPlayId = queue[0];
    }
    this.env.onChange();
  }

  /** `Next` on an AutoPlay group: the head of the current queue plays immediately. */
  private autoPlayNext(): void {
    if (this.currentAutoPlayId === null) return;
    const id = this.currentAutoPlayId;
    const queue = this.autoPlayQueues.find((q) => q.includes(id));
    if (!queue || queue.length === 0) return;
    this.executeById(queue[0], 'Next');
    this.currentAutoPlayId = queue[0];
    this.env.onChange();
  }

  private removeFromQueues(id: string): void {
    for (const queue of this.autoPlayQueues) {
      const at = queue.indexOf(id);
      if (at !== -1) {
        queue.splice(at, 1);
        break;
      }
    }
    this.autoPlayQueues = this.autoPlayQueues.filter((q) => q.length > 0);
  }

  // ---------------------------------------------------------------- single node execution

  private executeById(id: string, type: PlayoutType): void {
    const node = this.model.node(id);
    if (node) this.executeNode(node, type);
  }

  private executeNode(node: TreeNode, type: PlayoutType): void {
    if (isGroupNode(node)) {
      this.executeGroupSelf(node, type);
      return;
    }
    const definition = this.definitionOf(node);
    if (!definition) return;
    this.flash(node.id, type);

    const resolution = resolveTrigger(definition, node, type, this.env.serverState(node));
    if (resolution.op === null) return;
    if (resolution.scheduled) this.schedule(node, definition, resolution.op);
    else this.perform(node, definition, resolution.op);
  }

  /** The group row itself only drives the duration panel and the used mark. */
  private executeGroupSelf(group: TreeGroup, type: PlayoutType): void {
    this.flash(group.id, type);
    const duration = Number(group.props.duration ?? 0);
    if (type === 'Play' || type === 'PlayNow') {
      if (duration > 0) this.env.onDuration(duration);
      if (this.env.settings().markUsedItems) this.patch(group.id, { used: true });
    } else if (type === 'Stop') {
      if (duration > 0) this.env.onDuration(0);
    } else if (isClear(type)) {
      this.env.onDuration(0);
    }
  }

  /**
   * Runs `op` after the item's delay (ItemScheduler): a delayed play or preview is followed by its stop after the
   * duration. A delayed play replaces the pending update, as `schedulePlayAndStop` cancels every timer.
   */
  private schedule(item: TreeItem, definition: AnyItemDefinition, op: PlayoutOp): void {
    const { delay, duration, channel } = base(item);
    const settings = this.env.settings();
    const device = this.env.devices().find((d) => d.name === item.deviceName);
    const timedChannel = op === 'preview' ? (device?.previewChannel ?? 0) : channel;
    if (timedChannel === 0) return;
    const delayMs = toMilliseconds(delay, settings.delayType, device, timedChannel);
    const durationMs = toMilliseconds(duration, settings.delayType, device, timedChannel);
    if (delayMs === null || durationMs === null) return;

    const steps: Step[] = [{ afterMs: delayMs, run: () => this.performById(item.id, op) }];
    const end = SCHEDULED_END[op];
    if (end && !definition.durationless && durationMs > 0) {
      steps.push({ afterMs: delayMs + durationMs, run: () => this.performById(item.id, end) });
    }
    if (op === 'play') this.scheduler.cancel(timerKey(item.id, 'update'));
    this.scheduler.schedule(timerKey(item.id, timerKind(op)), steps);
  }

  private cancelTimers(id: string): void {
    for (const kind of Object.keys(TIMER_SUFFIX) as TimerKind[]) this.scheduler.cancel(timerKey(id, kind));
  }

  private performById(id: string, op: PlayoutOp): void {
    const node = this.model.node(id);
    const definition = node && !isGroupNode(node) ? this.definitionOf(node) : undefined;
    if (!node || isGroupNode(node) || !definition) return;
    this.perform(node, definition, op);
    this.env.onChange();
  }

  private perform(item: TreeItem, definition: AnyItemDefinition, op: PlayoutOp): void {
    // Decided by what the server reports right now (another program may have changed the layer).
    const state = this.env.serverState(item);
    const { main, shadows } = resolveTargets(this.env.devices(), item.deviceName);

    const batches = buildCommands(definition, item, op, state, { main, shadows });
    if (batches.length > 0 && !this.env.commandsDisabled()) {
      this.env.backend.sendCommands(batches).catch((e: unknown) => this.env.onError(`Playout failed: ${String(e)}`));
    }
    const targets = [...(main ? [main] : []), ...shadows];
    for (const effect of buildEffects(definition, item, op, state)) this.dispatchEffect(effect, targets);

    if (STOPPING_OPS.has(op)) {
      this.cancelTimers(item.id);
      this.stopWatching(item.id);
    }
    if (op === 'play' && this.env.settings().markUsedItems) this.patch(item.id, { used: true });
    if ((op === 'play' || op === 'next') && definition.autoPlay?.(item.props)) this.watchStart(item);
  }

  private dispatchEffect(effect: SideEffect, targets: readonly DeviceTarget[]): void {
    const { backend } = this.env;
    const fail = (e: unknown): void => this.env.onError(`Output failed: ${String(e)}`);
    switch (effect.kind) {
      case 'http':
        backend.sendHttp({ method: effect.method, url: effect.url, data: effect.data }).catch(fail);
        break;
      case 'osc':
        backend.sendOsc(effect.output, effect.path, effect.type, effect.value, effect.useBundle).catch(fail);
        break;
      case 'gpo':
        backend.sendGpo(effect.port).catch(fail);
        break;
      case 'custom':
        if (!this.env.commandsDisabled()) {
          for (const { name } of targets) backend.sendCustomCommand(name, effect.command).catch(fail);
        }
        break;
      case 'rundown':
        // A playout command item must not re-trigger itself endlessly.
        if (this.rundownCommandDepth === 0) {
          this.rundownCommandDepth++;
          try {
            this.env.runRundownCommand(effect.command);
          } finally {
            this.rundownCommandDepth--;
          }
        }
        break;
    }
  }

  // ---------------------------------------------------------------- bookkeeping

  private watchStart(item: TreeItem): void {
    this.stopWatching(item.id);
    const stop = this.env.watchStart(item, () => {
      this.stopWatching(item.id);
      this.autoPlayStarted(item.id);
    });
    this.startWatches.set(item.id, stop);
  }

  private stopWatching(id: string): void {
    this.startWatches.get(id)?.();
    this.startWatches.delete(id);
  }

  private definitionOf(item: TreeItem): AnyItemDefinition | undefined {
    return getItemDefinition(item.type);
  }

  private flash(id: string, type: PlayoutType): void {
    this.patch(id, { flash: this.runtime(id).flash + 1, flashKind: flashKindOf(type), flashAt: this.env.clock.now() });
  }

  private patch(id: string, change: Partial<ItemRuntime>): void {
    this.runtimes.set(id, { ...this.runtime(id), ...change });
  }

  /** Forgets runtime state, timers and queue entries of nodes that left the tree. */
  private prune(): void {
    if (this.runtimes.size === 0 && this.autoPlayQueues.length === 0 && this.startWatches.size === 0) return;
    const alive = this.model.ids();
    for (const id of [...this.runtimes.keys()]) {
      if (alive.has(id)) continue;
      this.runtimes.delete(id);
      this.cancelTimers(id);
      this.stopWatching(id);
    }
    this.autoPlayQueues = this.autoPlayQueues.map((q) => q.filter((id) => alive.has(id))).filter((q) => q.length > 0);
    if (this.playingId !== null && !alive.has(this.playingId)) this.playingId = null;
    if (this.autoStepId !== null && !alive.has(this.autoStepId)) this.autoStepId = null;
    if (this.currentAutoPlayId !== null && !alive.has(this.currentAutoPlayId)) this.currentAutoPlayId = null;
  }
}
