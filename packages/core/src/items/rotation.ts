import * as amcp from '../amcp';
import { ROW_COLORS } from '../base';
import { defineItem } from '../definition';
import type { ItemProps, OpFn } from '../definition';
import { DEFER_CONTROL, DEFER_FIELD, TRANSITION_CONTROLS, TRANSITION_FIELDS, WIDGET_FIELDS, floatControl, MIXER_TRIGGERS, mixerOps, tweenOf } from './mixer-common';
import type { TweenProps, WidgetProps } from './mixer-common';

export type RotationProps = ItemProps<{ rotation: number } & TweenProps & WidgetProps>;

const apply: OpFn<RotationProps> = ({ p, channel, videolayer }) => [
  amcp.setRotation(channel, videolayer, p.rotation, p.defer, tweenOf(p))
];
const reset: OpFn<RotationProps> = ({ channel, videolayer }) => [amcp.setRotation(channel, videolayer, 0, false)];

export const rotation = defineItem<RotationProps>({
  type: 'ROTATION',
  title: 'Rotation',
  category: 'mixer',
  color: ROW_COLORS.mixer,
  fields: [{ key: 'rotation', type: 'float', default: 0 }, ...TRANSITION_FIELDS, DEFER_FIELD],
  widgetFields: WIDGET_FIELDS,
  inspector: [
    { title: 'Rotation', controls: [floatControl('rotation', 'Rotation (degrees)', -360, 360, 1), ...TRANSITION_CONTROLS, DEFER_CONTROL] }
  ],
  triggers: MIXER_TRIGGERS,
  ops: mixerOps(apply, reset)
});
