import * as amcp from '../amcp';
import { DEFAULTS, ROW_COLORS } from '../base';
import { defineItem } from '../definition';
import type { ItemProps, OpFn } from '../definition';
import { MIXER_TRIGGERS, WIDGET_FIELDS, mixerOps } from './mixer-common';
import type { WidgetProps } from './mixer-common';

export type BlendModeProps = ItemProps<{ blendmode: string } & WidgetProps>;

const apply: OpFn<BlendModeProps> = ({ p, channel, videolayer }) => [amcp.setBlendMode(channel, videolayer, p.blendmode)];
const reset: OpFn<BlendModeProps> = ({ channel, videolayer }) => [amcp.setBlendMode(channel, videolayer, DEFAULTS.blendMode)];

export const blendmode = defineItem<BlendModeProps>({
  type: 'BLENDMODE',
  title: 'Blend mode',
  category: 'mixer',
  color: ROW_COLORS.mixer,
  fields: [{ key: 'blendmode', type: 'string', default: DEFAULTS.blendMode }],
  widgetFields: WIDGET_FIELDS,
  inspector: [
    { title: 'Blend mode', controls: [{ kind: 'select', key: 'blendmode', label: 'Blend mode', options: { lookup: 'blendmode' } }] }
  ],
  triggers: MIXER_TRIGGERS,
  ops: mixerOps(apply, reset)
});
