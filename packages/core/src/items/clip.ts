import * as amcp from '../amcp';
import { ROW_COLORS } from '../base';
import { defineItem } from '../definition';
import type { ItemProps, OpFn } from '../definition';
import { DEFER_CONTROL, DEFER_FIELD, TRANSITION_CONTROLS, TRANSITION_FIELDS, WIDGET_FIELDS, floatControl, MIXER_TRIGGERS, mixerOps, tweenOf } from './mixer-common';
import type { TweenProps, WidgetProps } from './mixer-common';

export type ClipProps = ItemProps<{ left: number; width: number; top: number; height: number } & TweenProps & WidgetProps>;

const apply: OpFn<ClipProps> = ({ p, channel, videolayer }) => [
  amcp.setClipping(channel, videolayer, p.left, p.top, p.width, p.height, p.defer, tweenOf(p))
];
const reset: OpFn<ClipProps> = ({ channel, videolayer }) => [amcp.setClipping(channel, videolayer, 0, 0, 1, 1, false)];

export const clip = defineItem<ClipProps>({
  type: 'CLIP',
  title: 'Clip',
  category: 'mixer',
  color: ROW_COLORS.mixer,
  fields: [
    { key: 'left', type: 'float', default: 0 },
    { key: 'width', type: 'float', default: 1 },
    { key: 'top', type: 'float', default: 0 },
    { key: 'height', type: 'float', default: 1 },
    ...TRANSITION_FIELDS,
    DEFER_FIELD
  ],
  widgetFields: WIDGET_FIELDS,
  inspector: [
    {
      title: 'Clip',
      controls: [
        floatControl('left', 'Left', 0, 1),
        floatControl('top', 'Top', 0, 1),
        floatControl('width', 'Width', 0, 1),
        floatControl('height', 'Height', 0, 1),
        ...TRANSITION_CONTROLS,
        DEFER_CONTROL
      ]
    }
  ],
  triggers: MIXER_TRIGGERS,
  ops: mixerOps(apply, reset)
});
