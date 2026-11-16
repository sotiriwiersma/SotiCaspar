import * as amcp from '../amcp';
import { ROW_COLORS } from '../base';
import { defineItem } from '../definition';
import type { ItemProps, OpFn } from '../definition';
import {
  DEFER_CONTROL, DEFER_FIELD, TRANSITION_CONTROLS, TRANSITION_FIELDS, TRIGGER_ON_NEXT_CONTROL, TRIGGER_ON_NEXT_FIELD, WIDGET_FIELDS,
  floatControl, MIXER_TRIGGERS, mixerOps, tweenOf
} from './mixer-common';
import type { TriggerOnNextProps, TweenProps, WidgetProps } from './mixer-common';

export type OpacityProps = ItemProps<{ opacity: number } & TweenProps & TriggerOnNextProps & WidgetProps>;

const apply: OpFn<OpacityProps> = ({ p, channel, videolayer }) => [
  amcp.setOpacity(channel, videolayer, p.opacity, p.defer, tweenOf(p))
];
const reset: OpFn<OpacityProps> = ({ channel, videolayer }) => [amcp.setOpacity(channel, videolayer, 1, false)];

export const opacity = defineItem<OpacityProps>({
  type: 'OPACITY',
  title: 'Opacity',
  category: 'mixer',
  color: ROW_COLORS.mixer,
  fields: [{ key: 'opacity', type: 'float', default: 1 }, ...TRANSITION_FIELDS, TRIGGER_ON_NEXT_FIELD, DEFER_FIELD],
  widgetFields: WIDGET_FIELDS,
  inspector: [
    {
      title: 'Opacity',
      controls: [floatControl('opacity', 'Opacity', 0, 1), ...TRANSITION_CONTROLS, TRIGGER_ON_NEXT_CONTROL, DEFER_CONTROL]
    }
  ],
  triggerOnNext: (p) => p.triggeronnext,
  triggers: MIXER_TRIGGERS,
  ops: mixerOps(apply, reset)
});
