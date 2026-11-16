import * as amcp from '../amcp';
import { ROW_COLORS } from '../base';
import { defineItem } from '../definition';
import type { ItemProps, OpFn } from '../definition';
import { DEFER_CONTROL, DEFER_FIELD, TRANSITION_CONTROLS, TRANSITION_FIELDS, WIDGET_FIELDS, floatControl, MIXER_TRIGGERS, mixerOps, tweenOf } from './mixer-common';
import type { TweenProps, WidgetProps } from './mixer-common';

export type SaturationProps = ItemProps<{ saturation: number } & TweenProps & WidgetProps>;

const apply: OpFn<SaturationProps> = ({ p, channel, videolayer }) => [
  amcp.setSaturation(channel, videolayer, p.saturation, p.defer, tweenOf(p))
];
const reset: OpFn<SaturationProps> = ({ channel, videolayer }) => [amcp.setSaturation(channel, videolayer, 1, false)];

export const saturation = defineItem<SaturationProps>({
  type: 'SATURATION',
  title: 'Saturation',
  category: 'mixer',
  color: ROW_COLORS.mixer,
  fields: [{ key: 'saturation', type: 'float', default: 1 }, ...TRANSITION_FIELDS, DEFER_FIELD],
  widgetFields: WIDGET_FIELDS,
  inspector: [{ title: 'Saturation', controls: [floatControl('saturation', 'Saturation', 0, 2), ...TRANSITION_CONTROLS, DEFER_CONTROL] }],
  triggers: MIXER_TRIGGERS,
  ops: mixerOps(apply, reset)
});
