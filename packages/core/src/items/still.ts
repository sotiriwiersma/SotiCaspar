import * as amcp from '../amcp';
import { ROW_COLORS } from '../base';
import { defineItem } from '../definition';
import type { ItemProps } from '../definition';
import { COLOR_FIELD, TRANSITION_CONTROLS, TRANSITION_FIELDS } from './producer-common';
import type { TransitionProps } from './producer-common';
import { NO_UPDATE } from './trigger-common';

export type StillProps = ItemProps<
  TransitionProps & {
    useauto: boolean;
    triggeronnext: boolean;
    color: string;
  }
>;

export const still = defineItem<StillProps>({
  type: 'STILL',
  title: 'Image',
  category: 'producer',
  color: ROW_COLORS.still,
  fields: [
    ...TRANSITION_FIELDS,
    { key: 'useauto', type: 'bool', default: false },
    { key: 'triggeronnext', type: 'bool', default: false }
  ],
  widgetFields: [COLOR_FIELD],
  inspector: [
    {
      title: 'Image',
      controls: [
        ...TRANSITION_CONTROLS,
        { kind: 'bool', key: 'useauto', label: 'Use auto' },
        { kind: 'bool', key: 'triggeronnext', label: 'Trigger on next' }
      ]
    }
  ],
  triggerOnNext: (p) => p.triggeronnext,
  previewMirror: true,
  triggers: NO_UPDATE,
  ops: {
    play: ({ item, p, channel, videolayer, loaded }) =>
      loaded
        ? [amcp.play(channel, videolayer)]
        : [amcp.playStill(channel, videolayer, item.name, p.transition, p.transitionDuration, p.tween, p.direction, p.useauto)],
    load: ({ item, p, channel, videolayer }) => [
      amcp.loadStill(channel, videolayer, item.name, p.transition, p.transitionDuration, p.tween, p.direction, p.useauto)
    ],
    preview: ({ item, p, channel, videolayer }) => [
      amcp.playStill(channel, videolayer, item.name, p.transition, p.transitionDuration, p.tween, p.direction, false)
    ],
    resume: ({ channel, videolayer }) => [amcp.play(channel, videolayer)]
  }
});
