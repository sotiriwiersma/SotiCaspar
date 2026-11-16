import { PLAYOUT_TYPES } from '../base';
import type { PlayoutType } from '../base';
import { IGNORED, PLAY_NOW, SCHEDULED_PLAY } from '../definition';
import type { TriggerFn, TriggerMap } from '../definition';
import type { Props } from '../types';

const ignore: TriggerFn<Props> = () => IGNORED;

/** Triggers the Qt widget does not handle at all (nothing happens, not even a state change). */
export const ignoring = (...types: readonly PlayoutType[]): TriggerMap<Props> =>
  Object.fromEntries(types.map((type) => [type, ignore]));

export const IGNORE_ALL = ignoring(...PLAYOUT_TYPES);
export const NO_UPDATE = ignoring('Update');
export const NO_PAUSE = ignoring('PauseResume');

/** `Load` is not a background load but a delayed play, like `Play` (mixers, colour producers). */
export const LOAD_PLAYS: TriggerMap<Props> = { Load: () => SCHEDULED_PLAY };

/** `Next` always plays, whether or not the item triggers on next. */
export const NEXT_PLAYS: TriggerMap<Props> = { Next: () => PLAY_NOW };

/** `Next` plays a trigger-on-next item, and otherwise advances it (CG NEXT, a custom command). */
export const NEXT_ADVANCES: TriggerMap<Props> = {
  Next: ({ p }) => (p.triggeronnext === true ? PLAY_NOW : { op: 'next' })
};
