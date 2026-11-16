import * as amcp from '../amcp';
import { ROW_COLORS } from '../base';
import { defineItem } from '../definition';
import type { ItemProps, OpFn } from '../definition';
import { DEFER_CONTROL, DEFER_FIELD, TRANSITION_CONTROLS, TRANSITION_FIELDS, WIDGET_FIELDS, floatControl, MIXER_TRIGGERS, mixerOps, tweenOf } from './mixer-common';
import type { TweenProps, WidgetProps } from './mixer-common';

export type LevelsProps = ItemProps<
  { minin: number; maxin: number; minout: number; maxout: number; gamma: number } & TweenProps & WidgetProps
>;

const apply: OpFn<LevelsProps> = ({ p, channel, videolayer }) => [
  amcp.setLevels(channel, videolayer, p.minin, p.maxin, p.gamma, p.minout, p.maxout, p.defer, tweenOf(p))
];
const reset: OpFn<LevelsProps> = ({ channel, videolayer }) => [amcp.setLevels(channel, videolayer, 0, 1, 1, 0, 1, false)];

export const levels = defineItem<LevelsProps>({
  type: 'LEVELS',
  title: 'Levels',
  category: 'mixer',
  color: ROW_COLORS.mixer,
  fields: [
    { key: 'minin', type: 'float', default: 0 },
    { key: 'maxin', type: 'float', default: 1 },
    { key: 'minout', type: 'float', default: 0 },
    { key: 'maxout', type: 'float', default: 1 },
    { key: 'gamma', type: 'float', default: 1 },
    ...TRANSITION_FIELDS,
    DEFER_FIELD
  ],
  widgetFields: WIDGET_FIELDS,
  inspector: [
    {
      title: 'Levels',
      controls: [
        floatControl('minin', 'Min in', 0, 1),
        floatControl('maxin', 'Max in', 0, 1),
        floatControl('gamma', 'Gamma', 0, 1),
        floatControl('minout', 'Min out', 0, 1),
        floatControl('maxout', 'Max out', 0, 1),
        ...TRANSITION_CONTROLS,
        DEFER_CONTROL
      ]
    }
  ],
  triggers: MIXER_TRIGGERS,
  ops: mixerOps(apply, reset)
});
