import * as amcp from '../amcp';
import { DEFAULTS, ROW_COLORS } from '../base';
import { defineItem } from '../definition';
import type { ItemProps, OpFn } from '../definition';
import { DEFER_CONTROL, MIXER_TRIGGERS, WIDGET_FIELDS, mixerOps } from './mixer-common';
import type { WidgetProps } from './mixer-common';

export type KeyerProps = ItemProps<{ defer: boolean } & WidgetProps>;

const apply: OpFn<KeyerProps> = ({ p, channel, videolayer }) => [amcp.setKeyer(channel, videolayer, 1, p.defer)];
const reset: OpFn<KeyerProps> = ({ channel, videolayer }) => [amcp.setKeyer(channel, videolayer, 0, false)];

export const keyer = defineItem<KeyerProps>({
  type: 'KEYER',
  title: 'Keyer',
  category: 'mixer',
  color: ROW_COLORS.mixer,
  // The Qt client writes this flag with QString::number(), as 0/1.
  fields: [{ key: 'defer', type: 'boolint', default: DEFAULTS.defer }],
  widgetFields: WIDGET_FIELDS,
  inspector: [{ title: 'Keyer', controls: [DEFER_CONTROL] }],
  triggers: MIXER_TRIGGERS,
  ops: mixerOps(apply, reset)
});
