import * as amcp from '../amcp';
import { ROW_COLORS } from '../base';
import { defineItem } from '../definition';
import type { ItemProps, OpFn } from '../definition';
import { DEFER_CONTROL, DEFER_FIELD, TRANSITION_CONTROLS, TRANSITION_FIELDS, WIDGET_FIELDS, floatControl, MIXER_TRIGGERS, mixerOps, tweenOf } from './mixer-common';
import type { TweenProps, WidgetProps } from './mixer-common';

export type BrightnessProps = ItemProps<{ brightness: number } & TweenProps & WidgetProps>;

const apply: OpFn<BrightnessProps> = ({ p, channel, videolayer }) => [
  amcp.setBrightness(channel, videolayer, p.brightness, p.defer, tweenOf(p))
];
const reset: OpFn<BrightnessProps> = ({ channel, videolayer }) => [amcp.setBrightness(channel, videolayer, 1, false)];

export const brightness = defineItem<BrightnessProps>({
  type: 'BRIGHTNESS',
  title: 'Brightness',
  category: 'mixer',
  color: ROW_COLORS.mixer,
  fields: [{ key: 'brightness', type: 'float', default: 1 }, ...TRANSITION_FIELDS, DEFER_FIELD],
  widgetFields: WIDGET_FIELDS,
  inspector: [{ title: 'Brightness', controls: [floatControl('brightness', 'Brightness', 0, 2), ...TRANSITION_CONTROLS, DEFER_CONTROL] }],
  triggers: MIXER_TRIGGERS,
  ops: mixerOps(apply, reset)
});
