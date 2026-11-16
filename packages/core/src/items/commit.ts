import * as amcp from '../amcp';
import { ROW_COLORS } from '../base';
import { defineItem } from '../definition';
import type { ItemProps, OpFn } from '../definition';
import { NO_AMCP } from './control-common';
import { WIDGET_FIELDS } from './mixer-common';
import type { WidgetProps } from './mixer-common';
import { NO_PAUSE } from './trigger-common';

export type CommitProps = ItemProps<WidgetProps>;

const apply: OpFn<CommitProps> = ({ channel }) => [amcp.setCommit(channel)];

/** Sends MIXER COMMIT, applying every deferred mixer command of the channel. */
export const commit = defineItem<CommitProps>({
  type: 'COMMIT',
  title: 'Commit',
  category: 'mixer',
  color: ROW_COLORS.mixer,
  fields: [],
  widgetFields: WIDGET_FIELDS,
  inspector: [],
  hiddenCommonBlocks: ['layer', 'duration'],
  triggers: NO_PAUSE,
  ops: { ...NO_AMCP, play: apply, preview: apply }
});
