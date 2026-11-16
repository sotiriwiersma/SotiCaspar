import * as amcp from '../amcp';
import { ROW_COLORS } from '../base';
import { defineItem } from '../definition';
import type { ItemProps } from '../definition';
import { COLOR_FIELD, frameDelay } from './producer-common';
import { NO_UPDATE } from './trigger-common';

export type RouteVideolayerProps = ItemProps<{
  fromchannel: number;
  fromvideolayer: number;
  outputdelay: number;
  color: string;
}>;

export const routeVideolayer = defineItem<RouteVideolayerProps>({
  type: 'ROUTEVIDEOLAYER',
  title: 'Route Videolayer',
  category: 'producer',
  color: ROW_COLORS.producer,
  fields: [
    { key: 'fromchannel', type: 'int', default: 1 },
    { key: 'fromvideolayer', type: 'int', default: 1 },
    { key: 'outputdelay', type: 'int', default: 0 }
  ],
  widgetFields: [COLOR_FIELD],
  inspector: [
    {
      title: 'Route Videolayer',
      controls: [
        { kind: 'int', key: 'fromchannel', label: 'From channel', min: 1, max: 99 },
        { kind: 'int', key: 'fromvideolayer', label: 'From video layer', min: 1, max: 99 },
        { kind: 'int', key: 'outputdelay', label: 'Output delay', min: 0, max: 999 }
      ]
    }
  ],
  triggers: NO_UPDATE,
  ops: {
    play: ({ p, channel, videolayer, loaded }) =>
      loaded
        ? [amcp.play(channel, videolayer)]
        : [amcp.playRouteVideolayer(channel, videolayer, p.fromchannel, p.fromvideolayer, frameDelay(p.outputdelay))],
    load: ({ p, channel, videolayer }) => [
      amcp.loadRouteVideolayer(channel, videolayer, p.fromchannel, p.fromvideolayer, frameDelay(p.outputdelay))
    ]
  }
});
