import * as amcp from '../amcp';
import { ROW_COLORS } from '../base';
import { defineItem } from '../definition';
import type { ItemProps } from '../definition';
import { COLOR_FIELD, LEGACY_TRANSITION_FIELDS, TRANSITION_CONTROLS } from './producer-common';
import type { TransitionProps } from './producer-common';
import { NO_UPDATE } from './trigger-common';

export type DeckLinkInputProps = ItemProps<
  TransitionProps & {
    device: number;
    format: string;
    color: string;
  }
>;

/** The transition properties are persisted and editable, but the Qt client never sends them to the server. */
export const deckLinkInput = defineItem<DeckLinkInputProps>({
  type: 'DECKLINKINPUT',
  title: 'DeckLink Input',
  category: 'producer',
  color: ROW_COLORS.producer,
  fields: [
    { key: 'device', type: 'int', default: 2 },
    { key: 'format', type: 'string', default: 'PAL' },
    ...LEGACY_TRANSITION_FIELDS
  ],
  widgetFields: [COLOR_FIELD],
  inspector: [
    {
      title: 'DeckLink Input',
      controls: [
        { kind: 'int', key: 'device', label: 'Device', min: 1, max: 99 },
        { kind: 'select', key: 'format', label: 'Format', options: { lookup: 'format' } },
        ...TRANSITION_CONTROLS
      ]
    }
  ],
  triggers: NO_UPDATE,
  ops: {
    play: ({ p, channel, videolayer, loaded }) =>
      loaded ? [amcp.play(channel, videolayer)] : [amcp.playDeviceInput(channel, videolayer, p.device, p.format)],
    load: ({ p, channel, videolayer }) => [amcp.loadDeviceInput(channel, videolayer, p.device, p.format)]
  }
});
