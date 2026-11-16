import * as amcp from './amcp';
import type { PlayoutType } from './base';
import { IGNORED, PLAY_NOW, SCHEDULED_PLAY } from './definition';
import type { AnyItemDefinition, EffectFn, ItemState, OpFn, PlayoutOp, Resolution, SideEffect } from './definition';
import type { BaseProps } from './base';
import type { RundownItem } from './types';

export const IDLE_STATE: Readonly<ItemState> = { loaded: false, paused: false, playing: false };

/** A CasparCG server the playout is sent to. */
export interface DeviceTarget {
  name: string;
  /** Channel that mirrors the item for preview, 0 when none is configured. */
  previewChannel: number;
}

export interface DeviceCommands {
  deviceName: string;
  commands: string[];
}

const base = (item: RundownItem) => item.props as unknown as BaseProps;

type DefaultOpFn = OpFn<any>;

/** Operations that behave the same for nearly every item. Items override them in `definition.ops`. */
const DEFAULT_OPS: Partial<Record<PlayoutOp, DefaultOpFn>> = {
  stop: (c) => [amcp.stop(c.channel, c.videolayer)],
  pause: (c) => [amcp.pause(c.channel, c.videolayer)],
  resume: (c) => [amcp.resume(c.channel, c.videolayer)],
  clearVideolayer: (c) => [amcp.clearVideolayer(c.channel, c.videolayer)],
  clearChannel: (c) => [amcp.clearChannel(c.channel), amcp.clearMixerChannel(c.channel)]
};

/** `clear` behaves like `clearVideolayer` unless the item defines it. */
function pick<T>(map: Partial<Record<PlayoutOp, T>> | undefined, op: PlayoutOp): T | undefined {
  return map?.[op] ?? (op === 'clear' ? map?.clearVideolayer : undefined);
}

const opFn = (definition: AnyItemDefinition, op: PlayoutOp): DefaultOpFn | undefined =>
  pick<DefaultOpFn>(definition.ops, op) ?? pick(DEFAULT_OPS, op);

/** The item does something for `op`: it defines AMCP for it, side effects, or relies on the defaults. */
const handles = (definition: AnyItemDefinition, op: PlayoutOp): boolean =>
  opFn(definition, op) !== undefined || pick(definition.effects, op) !== undefined;

/** The generic `executeCommand` shared by most Qt widgets; `definition.triggers` overrides it per trigger. */
function genericResolution(definition: AnyItemDefinition, item: RundownItem, type: PlayoutType, state: ItemState): Resolution {
  const p = item.props;
  const triggerOnNext = definition.triggerOnNext?.(p) ?? false;
  const autoPlay = definition.autoPlay?.(p) ?? false;

  switch (type) {
    case 'Stop':
      return { op: 'stop' };
    case 'Play':
    case 'Update':
      if (type === 'Play' && triggerOnNext) return IGNORED;
      if (!autoPlay) return SCHEDULED_PLAY;
      return base(item).delay < 0 ? IGNORED : PLAY_NOW;
    case 'PlayNow':
      return PLAY_NOW;
    case 'PauseResume':
      if (!state.playing) return IGNORED;
      return { op: state.paused ? 'resume' : 'pause' };
    case 'Load':
      return { op: 'load' };
    case 'Next':
      if (autoPlay) return { op: 'next' };
      return triggerOnNext ? PLAY_NOW : IGNORED;
    case 'Preview':
      return { op: 'preview' };
    case 'Invoke':
      return { op: 'invoke' };
    case 'Clear':
      return { op: 'clear' };
    case 'ClearVideoLayer':
      return { op: 'clearVideolayer' };
    case 'ClearChannel':
      return { op: 'clearChannel' };
  }
}

/**
 * Port of the `executeCommand` dispatch of the Qt rundown widgets: the generic rule, replaced per trigger by the
 * definition's `triggers`. Triggers the item has no operation for are ignored, and delayed ones with a negative delay too.
 */
export function resolveTrigger(definition: AnyItemDefinition, item: RundownItem, type: PlayoutType, state: ItemState): Resolution {
  const resolution =
    definition.triggers?.[type]?.({ item, p: item.props, state }) ?? genericResolution(definition, item, type, state);
  if (resolution.op === null || !handles(definition, resolution.op)) return IGNORED;
  return resolution.scheduled && base(item).delay < 0 ? IGNORED : resolution;
}

/** Operations after which the item is idle again and its pending timers no longer apply. */
export const STOPPING_OPS: ReadonlySet<PlayoutOp> = new Set(['stop', 'clear', 'clearVideolayer', 'clearChannel']);

/** The operation that follows a delayed `op` after the item's duration. */
export const SCHEDULED_END: Partial<Record<PlayoutOp, PlayoutOp>> = { play: 'stop', preview: 'stopPreview' };

export function nextState(state: ItemState, op: PlayoutOp): ItemState {
  switch (op) {
    case 'play':
    case 'next':
      return { loaded: false, paused: false, playing: true };
    case 'load':
      return { loaded: true, paused: false, playing: false };
    case 'pause':
      return { ...state, paused: true };
    case 'resume':
      return { ...state, paused: false };
    default:
      return STOPPING_OPS.has(op) ? { ...IDLE_STATE } : state;
  }
}

/** Operations that only target the preview channel of each device. */
const PREVIEW_ONLY: ReadonlySet<PlayoutOp> = new Set(['preview', 'stopPreview']);

/**
 * Builds the AMCP commands for `op`, for the item's device followed by every shadow device.
 * Items with `previewMirror` repeat `stop`/`clear*` on the preview channel of each device; `preview`
 * and `stopPreview` only target the preview channel.
 */
export function buildCommands(
  definition: AnyItemDefinition,
  item: RundownItem,
  op: PlayoutOp,
  state: ItemState,
  devices: { main?: DeviceTarget; shadows: readonly DeviceTarget[] }
): DeviceCommands[] {
  const fn = opFn(definition, op);
  if (!fn) return [];

  const { channel, videolayer } = base(item);
  const mirrored = definition.previewMirror === true && STOPPING_OPS.has(op);
  const targets = [...(devices.main ? [devices.main] : []), ...devices.shadows];
  const result: DeviceCommands[] = [];

  for (const device of targets) {
    const channels: number[] = [];
    if (PREVIEW_ONLY.has(op)) {
      if (device.previewChannel > 0) channels.push(device.previewChannel);
    } else {
      channels.push(channel);
      if (mirrored && device.previewChannel > 0) channels.push(device.previewChannel);
    }

    const commands = channels.flatMap((ch) =>
      fn({ item, p: item.props, channel: ch, videolayer, loaded: state.loaded, paused: state.paused })
    );
    if (commands.length > 0) result.push({ deviceName: device.name, commands });
  }

  return result;
}

/** Collects the non-AMCP side effects of `op` for an item (see `SideEffect`). */
export function buildEffects(definition: AnyItemDefinition, item: RundownItem, op: PlayoutOp, state: ItemState): SideEffect[] {
  const fn = pick(definition.effects, op) as EffectFn<any> | undefined;
  if (!fn) return [];
  const { channel, videolayer } = base(item);
  return fn({ item, p: item.props, channel, videolayer, loaded: state.loaded, paused: state.paused });
}
