import * as amcp from '../amcp';
import { ROW_COLORS } from '../base';
import { defineItem } from '../definition';
import type { ItemProps, OpFn } from '../definition';
import {
  DEFER_CONTROL, DEFER_FIELD, TRANSITION_CONTROLS, TRANSITION_FIELDS, TRIGGER_ON_NEXT_CONTROL, TRIGGER_ON_NEXT_FIELD, WIDGET_FIELDS,
  floatControl, MIXER_TRIGGERS, mixerOps, tweenOf
} from './mixer-common';
import type { TriggerOnNextProps, TweenProps, WidgetProps } from './mixer-common';

export type AnchorProps = ItemProps<{ positionx: number; positiony: number } & TweenProps & TriggerOnNextProps & WidgetProps>;

const apply: OpFn<AnchorProps> = ({ p, channel, videolayer }) => [
  amcp.setAnchor(channel, videolayer, p.positionx, p.positiony, p.defer, tweenOf(p))
];
const reset: OpFn<AnchorProps> = ({ channel, videolayer }) => [amcp.setAnchor(channel, videolayer, 0, 0, false)];

export const anchor = defineItem<AnchorProps>({
  type: 'ANCHOR',
  title: 'Anchor',
  category: 'mixer',
  color: ROW_COLORS.mixer,
  fields: [
    { key: 'positionx', type: 'float', default: 0 },
    { key: 'positiony', type: 'float', default: 0 },
    ...TRANSITION_FIELDS,
    TRIGGER_ON_NEXT_FIELD,
    DEFER_FIELD
  ],
  widgetFields: WIDGET_FIELDS,
  inspector: [
    {
      title: 'Anchor',
      controls: [
        floatControl('positionx', 'Position X', -2, 2),
        floatControl('positiony', 'Position Y', -2, 2),
        ...TRANSITION_CONTROLS,
        TRIGGER_ON_NEXT_CONTROL,
        DEFER_CONTROL
      ]
    }
  ],
  triggerOnNext: (p) => p.triggeronnext,
  triggers: MIXER_TRIGGERS,
  ops: mixerOps(apply, reset)
});
