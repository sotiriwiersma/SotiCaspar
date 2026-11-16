import type { FieldDef } from './types';

/** Properties shared by every rundown item (AbstractCommand in the Qt client), in XML order. */
export const BASE_FIELDS: readonly FieldDef[] = [
  { key: 'channel', type: 'int', default: 1 },
  { key: 'videolayer', type: 'int', default: 10 },
  { key: 'delay', type: 'int', default: 0 },
  { key: 'duration', type: 'int', default: 0 },
  { key: 'allowgpi', type: 'bool', default: false },
  { key: 'allowremotetriggering', type: 'bool', default: false },
  { key: 'remotetriggerid', type: 'string', default: '' },
  { key: 'storyid', type: 'string', default: '' }
];

export type BaseProps = {
  channel: number;
  videolayer: number;
  delay: number;
  duration: number;
  allowgpi: boolean;
  allowremotetriggering: boolean;
  remotetriggerid: string;
  storyid: string;
};

/** Defaults taken from Global.h of the Qt client. */
export const DEFAULTS = {
  channel: 1,
  videolayer: 10,
  audioVideolayer: 30,
  flashVideolayer: 20,
  transition: 'CUT',
  transitionDuration: 0,
  tween: 'Linear',
  direction: 'RIGHT',
  blendMode: 'Normal',
  mixerDuration: 0,
  defer: false,
  mipmap: false,
  rundownName: 'New Rundown'
} as const;

export const ROW_COLORS = {
  active: 'rgba(0, 255, 0, 255)',
  consumer: 'DarkSlateGray',
  gpi: 'Chocolate',
  group: 'rgba(70, 115, 195, 255)',
  audio: 'SlateGray',
  still: 'Goldenrod',
  movie: 'DarkKhaki',
  print: 'Goldenrod',
  clearOutput: 'Goldenrod',
  colorProducer: 'Goldenrod',
  mixer: 'Sienna',
  http: 'DarkOliveGreen',
  producer: 'SeaGreen',
  template: 'OliveDrab',
  separator: 'Maroon',
  storedData: 'Chocolate',
  transparent: 'Transparent'
} as const;

/** Playout triggers a user (or OSC/GPI) can fire at an item. */
export type PlayoutType =
  | 'Stop'
  | 'Play'
  | 'PlayNow'
  | 'PauseResume'
  | 'Load'
  | 'Next'
  | 'Update'
  | 'Invoke'
  | 'Preview'
  | 'Clear'
  | 'ClearVideoLayer'
  | 'ClearChannel';

export const PLAYOUT_TYPES: readonly PlayoutType[] = [
  'Stop', 'Play', 'PlayNow', 'PauseResume', 'Load', 'Next', 'Update', 'Invoke', 'Preview', 'Clear', 'ClearVideoLayer', 'ClearChannel'
];
