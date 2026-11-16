import { ROW_COLORS } from '../base';
import type { Control } from '../definition';
import type { FieldDef } from '../types';

/** Transition properties shared by the producers that are played with a transition. */
export type TransitionProps = {
  transition: string;
  transitionDuration: number;
  tween: string;
  direction: string;
};

export const TRANSITION_FIELDS: readonly FieldDef[] = [
  { key: 'transition', type: 'string', default: 'CUT' },
  { key: 'transitionDuration', type: 'int', default: 0 },
  { key: 'tween', type: 'string', default: 'Linear' },
  { key: 'direction', type: 'string', default: 'RIGHT' }
];

/** For the commands that still read the legacy misspelling `transtitionDuration` (colour, fade to black, DeckLink). */
export const LEGACY_TRANSITION_FIELDS: readonly FieldDef[] = TRANSITION_FIELDS.map((field) =>
  field.key === 'transitionDuration' ? { ...field, aliases: ['transtitionDuration'] } : field
);

export const TRANSITION_CONTROLS: readonly Control[] = [
  { kind: 'select', key: 'transition', label: 'Transition', options: { lookup: 'transition' } },
  { kind: 'int', key: 'transitionDuration', label: 'Duration (frames)', min: 0, max: 999 },
  { kind: 'select', key: 'tween', label: 'Tween', options: { lookup: 'tween' } },
  { kind: 'select', key: 'direction', label: 'Direction', options: { lookup: 'direction' } }
];

/** Row colour persisted by every rundown widget (`color`). */
export const COLOR_FIELD: FieldDef = { key: 'color', type: 'string', default: ROW_COLORS.transparent };

/** FRAMES_DELAY of a route is only sent when an output delay is set. */
export const frameDelay = (outputdelay: number) => (outputdelay === 0 ? undefined : outputdelay);
