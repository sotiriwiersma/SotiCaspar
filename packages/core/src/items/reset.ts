import * as amcp from '../amcp';
import { ROW_COLORS } from '../base';
import { defineItem } from '../definition';
import type { ItemProps, OpFn } from '../definition';
import { NO_AMCP } from './control-common';
import { WIDGET_FIELDS } from './mixer-common';
import type { WidgetProps } from './mixer-common';
import { NO_PAUSE } from './trigger-common';

export type ResetProps = ItemProps<WidgetProps>;

const apply: OpFn<ResetProps> = ({ channel, videolayer }) => [amcp.setReset(channel, videolayer)];

/** Sends MIXER CLEAR, resetting every mixer property of the layer. */
export const reset = defineItem<ResetProps>({
  type: 'RESET',
  title: 'Reset',
  category: 'mixer',
  color: ROW_COLORS.mixer,
  fields: [],
  widgetFields: WIDGET_FIELDS,
  inspector: [],
  hiddenCommonBlocks: ['duration'],
  durationless: true,
  triggers: NO_PAUSE,
  ops: { ...NO_AMCP, play: apply }
});
