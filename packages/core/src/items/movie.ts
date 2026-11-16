import * as amcp from '../amcp';
import { ROW_COLORS } from '../base';
import { defineItem } from '../definition';
import type { ItemProps } from '../definition';

export type MovieProps = ItemProps<{
  transition: string;
  transitionDuration: number;
  tween: string;
  direction: string;
  seek: number;
  length: number;
  loop: boolean;
  freezeonload: boolean;
  triggeronnext: boolean;
  autoplay: boolean;
  color: string;
  timecode: string;
}>;

export const movie = defineItem<MovieProps>({
  type: 'MOVIE',
  title: 'Video',
  category: 'producer',
  color: ROW_COLORS.movie,
  fields: [
    { key: 'transition', type: 'string', default: 'CUT' },
    { key: 'transitionDuration', type: 'int', default: 0 },
    { key: 'tween', type: 'string', default: 'Linear' },
    { key: 'direction', type: 'string', default: 'RIGHT' },
    { key: 'seek', type: 'int', default: 0 },
    { key: 'length', type: 'int', default: 0 },
    { key: 'loop', type: 'bool', default: false },
    { key: 'freezeonload', type: 'bool', default: false },
    { key: 'triggeronnext', type: 'bool', default: false },
    { key: 'autoplay', type: 'bool', default: false }
  ],
  widgetFields: [
    { key: 'color', type: 'string', default: ROW_COLORS.transparent },
    { key: 'timecode', type: 'string', default: '' }
  ],
  inspector: [
    {
      title: 'Video',
      controls: [
        { kind: 'text', key: '@name', label: 'Name' },
        { kind: 'select', key: 'transition', label: 'Transition', options: { lookup: 'transition' } },
        { kind: 'int', key: 'transitionDuration', label: 'Duration (frames)', min: 0 },
        { kind: 'select', key: 'tween', label: 'Tween', options: { lookup: 'tween' } },
        { kind: 'select', key: 'direction', label: 'Direction', options: { lookup: 'direction' } },
        { kind: 'int', key: 'seek', label: 'Seek (frames)', min: 0 },
        { kind: 'int', key: 'length', label: 'Length (frames)', min: 0 },
        { kind: 'bool', key: 'loop', label: 'Loop' },
        { kind: 'bool', key: 'freezeonload', label: 'Freeze on load' },
        { kind: 'bool', key: 'triggeronnext', label: 'Trigger on next' },
        { kind: 'bool', key: 'autoplay', label: 'Auto play' }
      ]
    }
  ],
  triggerOnNext: (p) => p.triggeronnext,
  autoPlay: (p) => p.autoplay,
  previewMirror: true,
  timeline: true,
  ops: {
    play: ({ item, p, channel, videolayer, loaded }) =>
      loaded
        ? [amcp.play(channel, videolayer)]
        : [amcp.playMovie(channel, videolayer, item.name, p.transition, p.transitionDuration, p.tween, p.direction, p.seek, p.length, p.loop, p.autoplay)],
    load: ({ item, p, channel, videolayer }) => [
      amcp.loadMovie(channel, videolayer, item.name, p.transition, p.transitionDuration, p.tween, p.direction, p.seek, p.length, p.loop, p.freezeonload, false)
    ],
    preview: ({ item, p, channel, videolayer }) => [
      amcp.loadMovie(channel, videolayer, item.name, p.transition, p.transitionDuration, p.tween, p.direction, p.seek, p.length, p.loop, true, false)
    ],
    next: ({ item, p, channel, videolayer }) => [
      amcp.playMovie(channel, videolayer, item.name, p.transition, p.transitionDuration, p.tween, p.direction, p.seek, p.length, p.loop, false)
    ]
  }
});
