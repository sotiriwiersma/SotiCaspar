import * as amcp from '../amcp';
import { ROW_COLORS } from '../base';
import { defineItem } from '../definition';
import type { ItemProps, OpFn } from '../definition';
import { DEFER_CONTROL, DEFER_FIELD, TRANSITION_CONTROLS, TRANSITION_FIELDS, WIDGET_FIELDS, floatControl, MIXER_TRIGGERS, mixerOps, tweenOf } from './mixer-common';
import type { TweenProps, WidgetProps } from './mixer-common';

export type ContrastProps = ItemProps<{ contrast: number } & TweenProps & WidgetProps>;

const apply: OpFn<ContrastProps> = ({ p, channel, videolayer }) => [
  amcp.setContrast(channel, videolayer, p.contrast, p.defer, tweenOf(p))
];
const reset: OpFn<ContrastProps> = ({ channel, videolayer }) => [amcp.setContrast(channel, videolayer, 1, false)];

export const contrast = defineItem<ContrastProps>({
  type: 'CONTRAST',
  title: 'Contrast',
  category: 'mixer',
  color: ROW_COLORS.mixer,
  fields: [{ key: 'contrast', type: 'float', default: 1 }, ...TRANSITION_FIELDS, DEFER_FIELD],
  widgetFields: WIDGET_FIELDS,
  inspector: [{ title: 'Contrast', controls: [floatControl('contrast', 'Contrast', 0, 2), ...TRANSITION_CONTROLS, DEFER_CONTROL] }],
  triggers: MIXER_TRIGGERS,
  ops: mixerOps(apply, reset)
});
