import * as amcp from '../amcp';
import { ROW_COLORS } from '../base';
import { defineItem } from '../definition';
import type { ItemProps } from '../definition';
import { COLOR_FIELD } from './producer-common';
import { NO_UPDATE } from './trigger-common';

export type ImageScrollerProps = ItemProps<{
  blur: number;
  speed: number;
  premultiply: boolean;
  progressive: boolean;
  color: string;
}>;

export const imageScroller = defineItem<ImageScrollerProps>({
  type: 'IMAGESCROLLER',
  title: 'Image Scroller',
  category: 'producer',
  color: ROW_COLORS.producer,
  fields: [
    { key: 'blur', type: 'int', default: 0 },
    { key: 'speed', type: 'int', default: 8 },
    { key: 'premultiply', type: 'bool', default: false },
    { key: 'progressive', type: 'bool', default: false }
  ],
  widgetFields: [COLOR_FIELD],
  inspector: [
    {
      title: 'Image Scroller',
      controls: [
        { kind: 'int', key: 'blur', label: 'Blur', min: 0, max: 99 },
        { kind: 'int', key: 'speed', label: 'Speed', min: 1, max: 100 },
        { kind: 'bool', key: 'premultiply', label: 'Premultiply' },
        { kind: 'bool', key: 'progressive', label: 'Progressive' }
      ]
    }
  ],
  triggers: NO_UPDATE,
  ops: {
    play: ({ item, p, channel, videolayer, loaded }) =>
      loaded
        ? [amcp.play(channel, videolayer)]
        : [amcp.playImageScroll(channel, videolayer, item.name, p.blur, p.speed, p.premultiply, p.progressive)],
    load: ({ item, p, channel, videolayer }) => [
      amcp.loadImageScroll(channel, videolayer, item.name, p.blur, p.speed, p.premultiply, p.progressive)
    ]
  }
});
