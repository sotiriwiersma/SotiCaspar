import { ROW_COLORS } from '../base';
import { COMMON_BLOCKS, defineItem } from '../definition';
import type { ItemProps } from '../definition';
import { COLOR_FIELD, NO_AMCP } from './control-common';
import { IGNORE_ALL } from './trigger-common';

export type GroupProps = ItemProps<{
  notes: string;
  autostep: boolean;
  autoplay: boolean;
  color: string;
}>;

/**
 * A group has no playout of its own: the rundown engine steps through its items. Its properties
 * are written by the rundown serializer between `expanded` and the nested `<items>`.
 */
export const group = defineItem<GroupProps>({
  type: 'GROUP',
  title: 'Group',
  category: 'layout',
  color: ROW_COLORS.group,
  fields: [
    { key: 'notes', type: 'string', default: '' },
    { key: 'autostep', type: 'bool', default: false },
    { key: 'autoplay', type: 'bool', default: false }
  ],
  widgetFields: [COLOR_FIELD],
  inspector: [
    {
      title: 'Group',
      controls: [
        { kind: 'text', key: '@label', label: 'Label' },
        { kind: 'textarea', key: 'notes', label: 'Notes' },
        { kind: 'bool', key: 'autostep', label: 'Auto step' },
        { kind: 'bool', key: 'autoplay', label: 'Auto play' }
      ]
    }
  ],
  hiddenCommonBlocks: ['device', 'channel', 'layer', 'delay', 'duration'],
  ops: NO_AMCP
});

export type SeparatorProps = ItemProps<{ color: string }>;

export const separator = defineItem<SeparatorProps>({
  type: 'SEPARATOR',
  title: 'Separator',
  category: 'layout',
  color: ROW_COLORS.separator,
  fields: [],
  widgetFields: [{ key: 'color', type: 'string', default: ROW_COLORS.separator }],
  inspector: [{ title: 'Separator', controls: [{ kind: 'text', key: '@label', label: 'Label' }] }],
  hiddenCommonBlocks: COMMON_BLOCKS,
  // The Qt widget does not handle any trigger.
  triggers: IGNORE_ALL,
  ops: NO_AMCP
});
