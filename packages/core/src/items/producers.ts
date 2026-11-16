import type { AnyItemDefinition } from '../definition';
import { audio } from './audio';
import { deckLinkInput } from './decklinkinput';
import { html } from './html';
import { imageScroller } from './imagescroller';
import { movie } from './movie';
import { routeChannel } from './routechannel';
import { routeVideolayer } from './routevideolayer';
import { solidColor } from './solidcolor';
import { still } from './still';
import { template } from './template';

/** Producer items (media, templates, HTML, colour, inputs, routes). */
export const producerItems: readonly AnyItemDefinition[] = [
  movie,
  still,
  audio,
  template,
  html,
  imageScroller,
  solidColor,
  deckLinkInput,
  routeChannel,
  routeVideolayer
];
