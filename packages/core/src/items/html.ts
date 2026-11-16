import * as amcp from '../amcp';
import { ROW_COLORS } from '../base';
import { defineItem } from '../definition';
import type { ItemProps } from '../definition';
import { COLOR_FIELD, TRANSITION_CONTROLS, TRANSITION_FIELDS } from './producer-common';
import type { TransitionProps } from './producer-common';

export type HtmlProps = ItemProps<
  TransitionProps & {
    url: string;
    freezeonload: boolean;
    triggeronnext: boolean;
    useauto: boolean;
    color: string;
  }
>;

export const html = defineItem<HtmlProps>({
  type: 'HTML',
  title: 'HTML Page',
  category: 'producer',
  color: ROW_COLORS.print,
  fields: [
    { key: 'url', type: 'string', default: '' },
    ...TRANSITION_FIELDS,
    { key: 'freezeonload', type: 'bool', default: false },
    { key: 'triggeronnext', type: 'bool', default: false },
    { key: 'useauto', type: 'bool', default: false }
  ],
  widgetFields: [COLOR_FIELD],
  inspector: [
    {
      title: 'HTML Page',
      controls: [
        { kind: 'text', key: 'url', label: 'URL' },
        ...TRANSITION_CONTROLS,
        { kind: 'bool', key: 'useauto', label: 'Use auto' },
        { kind: 'bool', key: 'triggeronnext', label: 'Trigger on next' }
      ]
    }
  ],
  triggerOnNext: (p) => p.triggeronnext,
  previewMirror: true,
  ops: {
    play: ({ p, channel, videolayer, loaded }) =>
      loaded
        ? [amcp.play(channel, videolayer)]
        : [amcp.playHtml(channel, videolayer, p.url, p.transition, p.transitionDuration, p.tween, p.direction, p.useauto)],
    load: ({ p, channel, videolayer }) => [
      amcp.loadHtml(channel, videolayer, p.url, p.transition, p.transitionDuration, p.tween, p.direction, p.freezeonload, p.useauto)
    ],
    preview: ({ p, channel, videolayer }) => [
      amcp.loadHtml(channel, videolayer, p.url, p.transition, p.transitionDuration, p.tween, p.direction, true, false)
    ],
    // The Qt widget has no CLEAR for HTML pages: every clear trigger just stops the layer.
    clearVideolayer: ({ channel, videolayer }) => [amcp.stop(channel, videolayer)],
    clearChannel: ({ channel, videolayer }) => [amcp.stop(channel, videolayer)]
  }
});
