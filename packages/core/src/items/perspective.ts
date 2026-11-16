import * as amcp from '../amcp';
import { ROW_COLORS } from '../base';
import { defineItem } from '../definition';
import type { ItemProps, OpFn } from '../definition';
import {
  DEFER_CONTROL, DEFER_FIELD, TRANSITION_CONTROLS, TRANSITION_FIELDS, TRIGGER_ON_NEXT_CONTROL, TRIGGER_ON_NEXT_FIELD, USE_MIPMAP_CONTROL,
  USE_MIPMAP_FIELD, WIDGET_FIELDS, floatControl, MIXER_TRIGGERS, mixerOps, tweenOf
} from './mixer-common';
import type { TriggerOnNextProps, TweenProps, WidgetProps } from './mixer-common';

export type PerspectiveProps = ItemProps<
  {
    upperleftx: number;
    upperlefty: number;
    upperrightx: number;
    upperrighty: number;
    lowerrightx: number;
    lowerrighty: number;
    lowerleftx: number;
    lowerlefty: number;
    usemipmap: boolean;
  } & TweenProps &
    TriggerOnNextProps &
    WidgetProps
>;

const apply: OpFn<PerspectiveProps> = ({ p, channel, videolayer }) =>
  amcp.setPerspective(
    channel, videolayer,
    p.upperleftx, p.upperlefty, p.upperrightx, p.upperrighty, p.lowerrightx, p.lowerrighty, p.lowerleftx, p.lowerlefty,
    p.defer, p.usemipmap, tweenOf(p)
  );
const reset: OpFn<PerspectiveProps> = ({ channel, videolayer }) =>
  amcp.setPerspective(channel, videolayer, 0, 0, 1, 0, 1, 1, 0, 1, false, false);

export const perspective = defineItem<PerspectiveProps>({
  type: 'PERSPECTIVE',
  title: 'Perspective',
  category: 'mixer',
  color: ROW_COLORS.mixer,
  fields: [
    { key: 'upperleftx', type: 'float', default: 0 },
    { key: 'upperlefty', type: 'float', default: 0 },
    { key: 'upperrightx', type: 'float', default: 1 },
    { key: 'upperrighty', type: 'float', default: 0 },
    { key: 'lowerrightx', type: 'float', default: 1 },
    { key: 'lowerrighty', type: 'float', default: 1 },
    { key: 'lowerleftx', type: 'float', default: 0 },
    { key: 'lowerlefty', type: 'float', default: 1 },
    ...TRANSITION_FIELDS,
    TRIGGER_ON_NEXT_FIELD,
    DEFER_FIELD,
    USE_MIPMAP_FIELD
  ],
  widgetFields: WIDGET_FIELDS,
  inspector: [
    {
      title: 'Perspective',
      controls: [
        floatControl('upperleftx', 'Upper left X', -2, 2),
        floatControl('upperlefty', 'Upper left Y', -2, 2),
        floatControl('upperrightx', 'Upper right X', -2, 2),
        floatControl('upperrighty', 'Upper right Y', -2, 2),
        floatControl('lowerrightx', 'Lower right X', -2, 2),
        floatControl('lowerrighty', 'Lower right Y', -2, 2),
        floatControl('lowerleftx', 'Lower left X', -2, 2),
        floatControl('lowerlefty', 'Lower left Y', -2, 2),
        ...TRANSITION_CONTROLS,
        TRIGGER_ON_NEXT_CONTROL,
        DEFER_CONTROL,
        USE_MIPMAP_CONTROL
      ]
    }
  ],
  triggerOnNext: (p) => p.triggeronnext,
  triggers: MIXER_TRIGGERS,
  ops: mixerOps(apply, reset)
});
