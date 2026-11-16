import * as amcp from '../amcp';
import { ROW_COLORS } from '../base';
import { defineItem } from '../definition';
import type { ItemProps, OpFn } from '../definition';
import { MIXER_TRIGGERS, WIDGET_FIELDS, floatControl, mixerOps } from './mixer-common';
import type { WidgetProps } from './mixer-common';

export type ChromaKeyProps = ItemProps<{ key: string; spread: number; spill: number; threshold: number } & WidgetProps>;

const apply: OpFn<ChromaKeyProps> = ({ p, channel, videolayer }) => [
  amcp.setChroma(channel, videolayer, p.key, p.threshold, p.spread, p.spill)
];
const reset: OpFn<ChromaKeyProps> = ({ channel, videolayer }) => [amcp.setChroma(channel, videolayer, 'None', 0, 0, 0)];

export const chromakey = defineItem<ChromaKeyProps>({
  type: 'CHROMAKEY',
  title: 'Chroma key',
  category: 'mixer',
  color: ROW_COLORS.mixer,
  fields: [
    { key: 'key', type: 'string', default: 'None' },
    { key: 'spread', type: 'float', default: 0.44 },
    { key: 'spill', type: 'float', default: 1 },
    { key: 'threshold', type: 'float', default: 0.34 }
  ],
  widgetFields: WIDGET_FIELDS,
  inspector: [
    {
      title: 'Chroma key',
      controls: [
        { kind: 'select', key: 'key', label: 'Key', options: { lookup: 'chroma' } },
        floatControl('threshold', 'Threshold', 0, 1),
        floatControl('spread', 'Softness', 0, 1),
        floatControl('spill', 'Spill', 0, 1)
      ]
    }
  ],
  triggers: MIXER_TRIGGERS,
  ops: mixerOps(apply, reset)
});
