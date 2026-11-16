import * as amcp from '../amcp';
import { DEFAULTS, ROW_COLORS } from '../base';
import { defineItem } from '../definition';
import type { ItemProps, OpFn } from '../definition';
import { DEFER_CONTROL, DEFER_FIELD, TRANSITION_CONTROLS, TRANSITION_FIELDS, WIDGET_FIELDS, floatControl, mixerOps, tweenOf } from './mixer-common';
import type { TweenProps, WidgetProps } from './mixer-common';
import { NO_PAUSE } from './trigger-common';

export type VolumeProps = ItemProps<{ volume: number } & TweenProps & WidgetProps>;

const apply: OpFn<VolumeProps> = ({ p, channel, videolayer }) => [
  amcp.setVolume(channel, videolayer, p.volume, p.defer, tweenOf(p))
];
const reset: OpFn<VolumeProps> = ({ channel, videolayer }) => [amcp.setVolume(channel, videolayer, 1, false)];

export const volume = defineItem<VolumeProps>({
  type: 'VOLUME',
  title: 'Volume',
  category: 'mixer',
  color: ROW_COLORS.mixer,
  fields: [{ key: 'volume', type: 'float', default: 1 }, ...TRANSITION_FIELDS, DEFER_FIELD],
  widgetFields: WIDGET_FIELDS,
  defaults: { videolayer: DEFAULTS.audioVideolayer },
  inspector: [{ title: 'Volume', controls: [floatControl('volume', 'Volume', 0, 2), ...TRANSITION_CONTROLS, DEFER_CONTROL] }],
  triggers: NO_PAUSE,
  ops: mixerOps(apply, reset, { preview: false })
});
