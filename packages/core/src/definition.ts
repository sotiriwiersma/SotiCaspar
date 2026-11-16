import type { BaseProps } from './base';
import type { PlayoutType } from './base';
import type { ConfigLookupName, LookupName } from './lookups';
import type { FieldDef, PropValue, Props, RundownItem } from './types';

/** Low-level operations an item can perform against a CasparCG channel/layer. */
export type PlayoutOp =
  | 'play'
  | 'load'
  | 'stop'
  | 'pause'
  | 'resume'
  | 'next'
  | 'update'
  | 'invoke'
  /** Shows the item on the preview channel of each device. */
  | 'preview'
  /** Takes a (delayed) preview off the preview channel again. */
  | 'stopPreview'
  /** The `Clear` trigger. Falls back to `clearVideolayer` for items that do not treat it differently. */
  | 'clear'
  | 'clearVideolayer'
  | 'clearChannel';

/** Runtime state of a rundown item as tracked while operating the rundown. */
export interface ItemState {
  loaded: boolean;
  paused: boolean;
  playing: boolean;
}

/**
 * What a trigger does for one item: nothing (`op: null`), run `op` at once, or with `scheduled` run it after the
 * item's delay (`ItemScheduler`). A scheduled `play` (or `preview`) is followed by its stop after the item's duration.
 */
export type Resolution = { op: null } | { op: PlayoutOp; scheduled?: boolean };

export interface TriggerContext<P extends Props> {
  item: RundownItem;
  p: P;
  state: ItemState;
}

/** Overrides the generic handling of one trigger; `undefined` keeps the generic rule. */
export type TriggerFn<P extends Props> = (ctx: TriggerContext<P>) => Resolution | undefined;
export type TriggerMap<P extends Props> = Partial<Record<PlayoutType, TriggerFn<P>>>;

export interface OpContext<P extends Props> {
  item: RundownItem;
  /** All persisted properties of the item (base + type specific + widget fields), typed per item. */
  p: P;
  /** Channel to target. Equals `p.channel`, or the device's preview channel for `preview` and preview mirroring. */
  channel: number;
  videolayer: number;
  /** The item was previously loaded in the background with LOADBG/LOAD. */
  loaded: boolean;
  paused: boolean;
}

/** Returns the AMCP commands for one operation. */
export type OpFn<P extends Props> = (ctx: OpContext<P>) => string[];

/**
 * Non-AMCP actions an item performs (HTTP calls, OSC/GPI output ...). They are executed by the
 * rundown engine in addition to the AMCP commands of the same operation.
 */
export type SideEffect =
  | { kind: 'http'; method: 'GET' | 'POST'; url: string; data: Array<{ key: string; value: string }> }
  | { kind: 'osc'; output: string; path: string; type: string; value: string; useBundle: boolean }
  | { kind: 'gpo'; port: number }
  /** Sends a raw AMCP command to the item's device and every shadow device (CUSTOMCOMMAND). */
  | { kind: 'custom'; command: string }
  /** Fires a rundown-wide playout trigger (PLAYOUTCOMMAND). */
  | { kind: 'rundown'; command: PlayoutType };

export type EffectFn<P extends Props> = (ctx: OpContext<P>) => SideEffect[];

/** Properties an inspector control changes besides its own, e.g. the file recorder's codec also sets the preset. */
export type ControlChange = (value: PropValue, props: Readonly<Props>) => Props;

/**
 * One control in the inspector. `key` is a property key of the item, or one of the
 * item-level fields `@name`, `@label` and `@deviceName`.
 */
export type Control =
  | { kind: 'text' | 'textarea' | 'color'; key: string; label: string; placeholder?: string }
  | { kind: 'int' | 'float'; key: string; label: string; min?: number; max?: number; step?: number }
  | { kind: 'bool'; key: string; label: string }
  | {
      kind: 'select';
      key: string;
      label: string;
      /** Static list, a built-in lookup, or a list the UI resolves from the application configuration. */
      options: readonly string[] | { lookup: LookupName | ConfigLookupName };
      onChange?: ControlChange;
    };

export interface InspectorSection {
  title: string;
  controls: readonly Control[];
}

/** The standard blocks of the inspector that every item offers (the Qt InspectorOutputWidget). */
export const COMMON_BLOCKS = ['device', 'channel', 'layer', 'delay', 'duration', 'gpi', 'remote'] as const;
export type CommonBlock = (typeof COMMON_BLOCKS)[number];

export type ItemCategory = 'producer' | 'mixer' | 'control' | 'output' | 'layout';

export interface ItemDefinition<P extends Props = Props> {
  /** Value of the `<type>` element in the rundown XML, e.g. `MOVIE`. */
  type: string;
  title: string;
  category: ItemCategory;
  /** Default row colour (CSS colour name or rgba()). */
  color: string;
  /** Type specific properties in XML order, after the shared BASE_FIELDS. */
  fields: readonly FieldDef[];
  /** Presentation properties persisted after `fields` (the Qt widget's read/writeProperties). */
  widgetFields: readonly FieldDef[];
  /**
   * Values of a newly created item that differ from the field defaults. The field defaults are what the Qt
   * `readProperties` falls back to for elements missing in a file; these are the Qt constructor defaults.
   */
  defaults?: Partial<P>;
  /** Type specific inspector sections. Target, channel, layer, delay etc. are rendered by the UI for every item. */
  inspector: readonly InspectorSection[];
  /** Standard inspector blocks the Qt inspector disables for this type. */
  hiddenCommonBlocks?: readonly CommonBlock[];
  ops: Partial<Record<PlayoutOp, OpFn<P>>>;
  /** Side effects per operation, for items that do more than send AMCP (see `SideEffect`). */
  effects?: Partial<Record<PlayoutOp, EffectFn<P>>>;
  /** Per trigger overrides of the generic handling in `resolveTrigger` (the item's `executeCommand` in Qt). */
  triggers?: TriggerMap<P>;
  /** Item is played by the `Next` trigger instead of `Play`. */
  triggerOnNext?: (p: P) => boolean;
  /** Item is loaded in the background and cued automatically after the current one (`AUTO`). Only these items take part in a group's AutoPlay queue. */
  autoPlay?: (p: P) => boolean;
  /** Stop and clear triggers are repeated on the preview channel of each device. */
  previewMirror?: boolean;
  /** A delayed play is never followed by a stop (the Qt widget schedules it with a duration of 0). */
  durationless?: boolean;
  /** The row shows playback time and progress that the server reports over OSC. */
  timeline?: boolean;
}

export type AnyItemDefinition = ItemDefinition<any>;

export type ItemProps<S extends Props> = BaseProps & S;

export function defineItem<P extends Props>(definition: ItemDefinition<P>): ItemDefinition<P> {
  return definition;
}

export const IGNORED: Resolution = { op: null };
/** The delayed play of `Play`: the op runs after the delay and `stop` after the duration. */
export const SCHEDULED_PLAY: Resolution = { op: 'play', scheduled: true };
export const SCHEDULED_UPDATE: Resolution = { op: 'update', scheduled: true };
export const PLAY_NOW: Resolution = { op: 'play' };
