import * as amcp from '../amcp';
import { ROW_COLORS } from '../base';
import { defineItem } from '../definition';
import type { ItemProps, OpFn } from '../definition';
import {
  DEFER_CONTROL, DEFER_FIELD, TRANSITION_CONTROLS, TRANSITION_FIELDS, TRIGGER_ON_NEXT_CONTROL, TRIGGER_ON_NEXT_FIELD, USE_MIPMAP_CONTROL,
  USE_MIPMAP_FIELD, WIDGET_FIELDS, floatControl, MIXER_TRIGGERS, mixerOps, tweenOf
} from './mixer-common';
import type { TriggerOnNextProps, TweenProps, WidgetProps } from './mixer-common';

export type FillProps = ItemProps<
  { positionx: number; positiony: number; scalex: number; scaley: number; usemipmap: boolean } & TweenProps & TriggerOnNextProps & WidgetProps
>;

const apply: OpFn<FillProps> = ({ p, channel, videolayer }) =>
  amcp.setFill(channel, videolayer, p.positionx, p.positiony, p.scalex, p.scaley, p.defer, p.usemipmap, tweenOf(p));
const reset: OpFn<FillProps> = ({ channel, videolayer }) => amcp.setFill(channel, videolayer, 0, 0, 1, 1, false, false);

export const fill = defineItem<FillProps>({
  type: 'FILL',
  title: 'Fill',
  category: 'mixer',
  color: ROW_COLORS.mixer,
  fields: [
    { key: 'positionx', type: 'float', default: 0 },
    { key: 'positiony', type: 'float', default: 0 },
    { key: 'scalex', type: 'float', default: 1 },
    { key: 'scaley', type: 'float', default: 1 },
    ...TRANSITION_FIELDS,
    TRIGGER_ON_NEXT_FIELD,
    DEFER_FIELD,
    USE_MIPMAP_FIELD
  ],
  widgetFields: WIDGET_FIELDS,
  inspector: [
    {
      title: 'Fill',
      controls: [
        floatControl('positionx', 'Position X', -1, 1),
        floatControl('positiony', 'Position Y', -1, 1),
        floatControl('scalex', 'Size X', 0, 2),
        floatControl('scaley', 'Size Y', 0, 2),
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
