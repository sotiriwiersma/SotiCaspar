import * as amcp from '../amcp';
import { DEFAULTS, ROW_COLORS } from '../base';
import { defineItem } from '../definition';
import type { ItemProps } from '../definition';
import { COLOR_FIELD, TRANSITION_CONTROLS, TRANSITION_FIELDS } from './producer-common';
import type { TransitionProps } from './producer-common';

export type AudioProps = ItemProps<
  TransitionProps & {
    loop: boolean;
    useauto: boolean;
    triggeronnext: boolean;
    color: string;
  }
>;

export const audio = defineItem<AudioProps>({
  type: 'AUDIO',
  title: 'Audio',
  category: 'producer',
  color: ROW_COLORS.audio,
  fields: [
    ...TRANSITION_FIELDS,
    { key: 'loop', type: 'bool', default: false },
    { key: 'useauto', type: 'bool', default: false },
    { key: 'triggeronnext', type: 'bool', default: false }
  ],
  widgetFields: [COLOR_FIELD],
  inspector: [
    {
      title: 'Audio',
      controls: [
        ...TRANSITION_CONTROLS,
        { kind: 'bool', key: 'loop', label: 'Loop' },
        { kind: 'bool', key: 'useauto', label: 'Use auto' },
        { kind: 'bool', key: 'triggeronnext', label: 'Trigger on next' }
      ]
    }
  ],
  triggerOnNext: (p) => p.triggeronnext,
  defaults: { videolayer: DEFAULTS.audioVideolayer },
  ops: {
    play: ({ item, p, channel, videolayer, loaded }) =>
      loaded
        ? [amcp.play(channel, videolayer)]
        : [amcp.playAudio(channel, videolayer, item.name, p.transition, p.transitionDuration, p.tween, p.direction, p.loop, p.useauto)],
    load: ({ item, p, channel, videolayer }) => [
      amcp.loadAudio(channel, videolayer, item.name, p.transition, p.transitionDuration, p.tween, p.direction, p.loop, p.useauto)
    ]
  }
});
