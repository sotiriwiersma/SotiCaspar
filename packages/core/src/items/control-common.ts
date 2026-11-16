import { ROW_COLORS } from '../base';
import type { OpFn, PlayoutOp } from '../definition';
import type { Props } from '../types';

export const NO_OP: OpFn<Props> = () => [];

/**
 * Stop/pause/clear for items whose Qt widget only cancels its scheduled action on these triggers
 * (HTTP, OSC, GPO, print, separator ...). Overrides the engine's default AMCP for them.
 */
export const NO_AMCP: Partial<Record<PlayoutOp, OpFn<Props>>> = {
  stop: NO_OP,
  pause: NO_OP,
  resume: NO_OP,
  clearVideolayer: NO_OP,
  clearChannel: NO_OP
};

/** Persisted row colour written by every Qt rundown widget after the command properties. */
export const COLOR_FIELD = { key: 'color', type: 'string', default: ROW_COLORS.transparent } as const;
