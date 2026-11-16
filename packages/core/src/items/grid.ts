import * as amcp from '../amcp';
import { DEFAULTS, ROW_COLORS } from '../base';
import { defineItem } from '../definition';
import type { ItemProps, OpFn } from '../definition';
import { DEFER_CONTROL, DEFER_FIELD, MIXER_TRIGGERS, TRANSITION_CONTROLS, WIDGET_FIELDS, mixerOps } from './mixer-common';
import type { TweenProps, WidgetProps } from './mixer-common';

export type GridProps = ItemProps<{ grid: number } & TweenProps & WidgetProps>;

const apply: OpFn<GridProps> = ({ p, channel }) => [amcp.setGrid(channel, p.grid, p.transitionDuration, p.tween, p.defer)];

/** The grid fills layers 1..grid², so stopping clears the mixer of each of them. */
const clearCells: OpFn<GridProps> = ({ p, channel }) =>
  Array.from({ length: p.grid * p.grid }, (_, i) => amcp.clearMixerVideolayer(channel, i + 1));

export const grid = defineItem<GridProps>({
  type: 'GRID',
  title: 'Grid',
  category: 'mixer',
  color: ROW_COLORS.mixer,
  fields: [
    { key: 'grid', type: 'int', default: 2 },
    // Unlike the other mixer commands, the Qt GridCommand does not read the legacy `transtitionDuration`.
    { key: 'transitionDuration', type: 'int', default: DEFAULTS.mixerDuration },
    { key: 'tween', type: 'string', default: DEFAULTS.tween },
    DEFER_FIELD
  ],
  widgetFields: WIDGET_FIELDS,
  inspector: [
    { title: 'Grid', controls: [{ kind: 'int', key: 'grid', label: 'Grid', min: 1 }, ...TRANSITION_CONTROLS, DEFER_CONTROL] }
  ],
  hiddenCommonBlocks: ['layer'],
  durationless: true,
  triggers: MIXER_TRIGGERS,
  ops: { ...mixerOps(apply, clearCells), clearVideolayer: clearCells }
});
