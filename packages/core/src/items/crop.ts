import * as amcp from '../amcp';
import { ROW_COLORS } from '../base';
import { defineItem } from '../definition';
import type { ItemProps, OpFn } from '../definition';
import { DEFER_CONTROL, DEFER_FIELD, TRANSITION_CONTROLS, TRANSITION_FIELDS, WIDGET_FIELDS, floatControl, MIXER_TRIGGERS, mixerOps, tweenOf } from './mixer-common';
import type { TweenProps, WidgetProps } from './mixer-common';

export type CropProps = ItemProps<{ left: number; top: number; right: number; bottom: number } & TweenProps & WidgetProps>;

const apply: OpFn<CropProps> = ({ p, channel, videolayer }) => [
  amcp.setCrop(channel, videolayer, p.left, p.top, p.right, p.bottom, p.defer, tweenOf(p))
];
const reset: OpFn<CropProps> = ({ channel, videolayer }) => [amcp.setCrop(channel, videolayer, 0, 0, 1, 1, false)];

export const crop = defineItem<CropProps>({
  type: 'CROP',
  title: 'Crop',
  category: 'mixer',
  color: ROW_COLORS.mixer,
  fields: [
    { key: 'left', type: 'float', default: 0 },
    { key: 'top', type: 'float', default: 0 },
    { key: 'right', type: 'float', default: 1 },
    { key: 'bottom', type: 'float', default: 1 },
    ...TRANSITION_FIELDS,
    DEFER_FIELD
  ],
  widgetFields: WIDGET_FIELDS,
  inspector: [
    {
      title: 'Crop',
      controls: [
        floatControl('left', 'Left', 0, 1),
        floatControl('top', 'Top', 0, 1),
        floatControl('right', 'Right', 0, 1),
        floatControl('bottom', 'Bottom', 0, 1),
        ...TRANSITION_CONTROLS,
        DEFER_CONTROL
      ]
    }
  ],
  triggers: MIXER_TRIGGERS,
  ops: mixerOps(apply, reset)
});
