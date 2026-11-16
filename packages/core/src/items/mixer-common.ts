import * as amcp from '../amcp';
import { DEFAULTS, ROW_COLORS } from '../base';
import type { Control, OpFn, PlayoutOp, TriggerMap } from '../definition';
import type { FieldDef, Props } from '../types';
import { LOAD_PLAYS, NO_PAUSE } from './trigger-common';

/** Transition settings shared by most mixer items. */
export type TweenProps = { transitionDuration: number; tween: string; defer: boolean };
export type TriggerOnNextProps = { triggeronnext: boolean };
export type WidgetProps = { color: string };

/** The Qt mixer commands (all but grid) still read the legacy misspelling `transtitionDuration`. */
export const TRANSITION_FIELDS: readonly FieldDef[] = [
  { key: 'transitionDuration', type: 'int', default: DEFAULTS.mixerDuration, aliases: ['transtitionDuration'] },
  { key: 'tween', type: 'string', default: DEFAULTS.tween }
];
export const DEFER_FIELD: FieldDef = { key: 'defer', type: 'bool', default: DEFAULTS.defer };
export const TRIGGER_ON_NEXT_FIELD: FieldDef = { key: 'triggeronnext', type: 'bool', default: false };
export const USE_MIPMAP_FIELD: FieldDef = { key: 'usemipmap', type: 'bool', default: DEFAULTS.mipmap };

/** The Qt widgets of every mixer item only persist the row colour. */
export const WIDGET_FIELDS: readonly FieldDef[] = [{ key: 'color', type: 'string', default: ROW_COLORS.transparent }];

export const TRANSITION_CONTROLS: readonly Control[] = [
  { kind: 'int', key: 'transitionDuration', label: 'Duration (frames)', min: 0, max: 999 },
  { kind: 'select', key: 'tween', label: 'Tween', options: { lookup: 'tween' } }
];
export const DEFER_CONTROL: Control = { kind: 'bool', key: 'defer', label: 'Defer' };
export const TRIGGER_ON_NEXT_CONTROL: Control = { kind: 'bool', key: 'triggeronnext', label: 'Trigger on next' };
export const USE_MIPMAP_CONTROL: Control = { kind: 'bool', key: 'usemipmap', label: 'Use mipmapping' };

export const floatControl = (key: string, label: string, min: number, max: number, step = 0.01): Control => ({
  kind: 'float', key, label, min, max, step
});

export const tweenOf = (p: TweenProps): amcp.Tween => ({ duration: p.transitionDuration, easing: p.tween });

const CLEAR_MIXER_LAYER: OpFn<Props> = ({ channel, videolayer }) => [amcp.clearMixerVideolayer(channel, videolayer)];

/** Mixer widgets ignore pause/resume, and `Load` is a delayed play like `Play`. */
export const MIXER_TRIGGERS: TriggerMap<Props> = { ...NO_PAUSE, ...LOAD_PLAYS };

/**
 * Operations of a regular mixer item: Play/Preview apply the effect, Stop and Clear restore the neutral
 * state, ClearVideoLayer resets the whole mixer layer. ClearChannel is the generic default.
 */
export function mixerOps<P extends Props>(apply: OpFn<P>, reset: OpFn<P>, { preview = true } = {}): Partial<Record<PlayoutOp, OpFn<P>>> {
  return {
    play: apply,
    stop: reset,
    clear: reset,
    clearVideolayer: CLEAR_MIXER_LAYER,
    ...(preview && { preview: apply })
  };
}

