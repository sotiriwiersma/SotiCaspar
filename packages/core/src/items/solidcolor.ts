import * as amcp from '../amcp';
import { ROW_COLORS } from '../base';
import { defineItem } from '../definition';
import type { ItemProps } from '../definition';
import { COLOR_FIELD, LEGACY_TRANSITION_FIELDS, TRANSITION_CONTROLS } from './producer-common';
import type { TransitionProps } from './producer-common';
import { LOAD_PLAYS, NEXT_PLAYS, NO_UPDATE } from './trigger-common';

export type SolidColorProps = ItemProps<
  TransitionProps & {
    solidcolor: string;
    useauto: boolean;
    triggeronnext: boolean;
    color: string;
  }
>;

/** Converts `#AARRGGBB` to the premultiplied colour CasparCG expects. */
export function premultipliedColor(color: string): string {
  const hex = color.replace(/#/g, '');
  const component = (start: number) => Number.parseInt(hex.slice(start, start + 2), 16) || 0;
  const alpha = component(0);
  const premultiply = (value: number) => Math.floor((value * alpha) / 255);
  const toHex = (value: number) => value.toString(16).padStart(2, '0');
  return `#${toHex(alpha)}${toHex(premultiply(component(2)))}${toHex(premultiply(component(4)))}${toHex(premultiply(component(6)))}`;
}

export const solidColor = defineItem<SolidColorProps>({
  type: 'SOLIDCOLOR',
  title: 'Solid Color',
  category: 'producer',
  color: ROW_COLORS.colorProducer,
  fields: [
    ...LEGACY_TRANSITION_FIELDS,
    { key: 'solidcolor', type: 'string', default: '#FF000000' },
    { key: 'useauto', type: 'bool', default: false },
    { key: 'triggeronnext', type: 'bool', default: false }
  ],
  widgetFields: [COLOR_FIELD],
  inspector: [
    {
      title: 'Solid Color',
      controls: [
        { kind: 'color', key: 'solidcolor', label: 'Color' },
        ...TRANSITION_CONTROLS,
        { kind: 'bool', key: 'useauto', label: 'Use auto' },
        { kind: 'bool', key: 'triggeronnext', label: 'Trigger on next' }
      ]
    }
  ],
  triggerOnNext: (p) => p.triggeronnext,
  triggers: { ...NO_UPDATE, ...LOAD_PLAYS, ...NEXT_PLAYS },
  ops: {
    play: ({ p, channel, videolayer }) => [
      amcp.playColor(channel, videolayer, premultipliedColor(p.solidcolor), p.transition, p.transitionDuration, p.tween, p.direction, p.useauto)
    ],
    preview: ({ p, channel, videolayer }) => [
      amcp.loadColor(channel, videolayer, premultipliedColor(p.solidcolor), p.transition, p.transitionDuration, p.tween, p.direction, false)
    ],
    resume: ({ channel, videolayer }) => [amcp.play(channel, videolayer)]
  }
});
