import { ROW_COLORS } from '../base';
import type { PlayoutType } from '../base';
import { IGNORED, SCHEDULED_UPDATE, defineItem } from '../definition';
import type { EffectFn, ItemProps, SideEffect, TriggerFn } from '../definition';
import { parseList } from '../list';
import { COLOR_FIELD, NO_AMCP } from './control-common';
import { NEXT_ADVANCES, NO_PAUSE, ignoring } from './trigger-common';

// ---------------------------------------------------------------- PLAYOUTCOMMAND

/** Persisted text of the `playoutcommand` element (Playout::toString in the Qt client). */
const PLAYOUT_COMMANDS: Readonly<Record<string, PlayoutType>> = {
  Stop: 'Stop',
  Play: 'Play',
  'Play Now': 'PlayNow',
  'Pause / Resume': 'PauseResume',
  Load: 'Load',
  Next: 'Next',
  Update: 'Update',
  Invoke: 'Invoke',
  Preview: 'Preview',
  Clear: 'Clear',
  'Clear Video Layer': 'ClearVideoLayer',
  'Clear Channel': 'ClearChannel'
};

export type PlayoutCommandProps = ItemProps<{ playoutcommand: string; color: string }>;

/** Fires a rundown-wide trigger (the F-key equivalent) when played. */
export const playoutCommand = defineItem<PlayoutCommandProps>({
  type: 'PLAYOUTCOMMAND',
  title: 'Playout command',
  category: 'control',
  color: ROW_COLORS.mixer,
  fields: [{ key: 'playoutcommand', type: 'string', default: 'Play' }],
  widgetFields: [COLOR_FIELD],
  inspector: [
    {
      title: 'Playout command',
      controls: [{ kind: 'select', key: 'playoutcommand', label: 'Playout', options: Object.keys(PLAYOUT_COMMANDS) }]
    }
  ],
  hiddenCommonBlocks: ['device', 'channel', 'layer', 'duration'],
  durationless: true,
  // The Qt widget only reacts to Play and PlayNow, not even Stop cancels a delayed play.
  triggers: ignoring('Stop', 'Update', 'PauseResume', 'Load', 'Next', 'Invoke', 'Preview', 'Clear', 'ClearVideoLayer', 'ClearChannel'),
  ops: NO_AMCP,
  effects: {
    play: ({ p }) => {
      const command = PLAYOUT_COMMANDS[p.playoutcommand];
      return command ? [{ kind: 'rundown', command }] : [];
    }
  }
});

// ---------------------------------------------------------------- CUSTOMCOMMAND

type CommandKey =
  | 'stopCommand'
  | 'playCommand'
  | 'loadCommand'
  | 'pauseCommand'
  | 'nextCommand'
  | 'updateCommand'
  | 'invokeCommand'
  | 'previewCommand'
  | 'clearCommand'
  | 'clearVideolayerCommand'
  | 'clearChannelCommand';

export type CustomCommandProps = ItemProps<Record<CommandKey, string> & { triggeronnext: boolean; color: string }>;

const sendCommand =
  (key: CommandKey): EffectFn<CustomCommandProps> =>
  ({ p }) =>
    p[key] ? [{ kind: 'custom', command: p[key] }] : [];

/** Sends raw AMCP text per trigger. The Qt widget sends `pauseCommand` for every PauseResume, whatever the state. */
export const customCommand = defineItem<CustomCommandProps>({
  type: 'CUSTOMCOMMAND',
  title: 'Custom command',
  category: 'control',
  color: ROW_COLORS.mixer,
  fields: [
    { key: 'stopCommand', type: 'string', default: '' },
    { key: 'playCommand', type: 'string', default: '' },
    { key: 'loadCommand', type: 'string', default: '' },
    { key: 'pauseCommand', type: 'string', default: '' },
    { key: 'nextCommand', type: 'string', default: '' },
    { key: 'updateCommand', type: 'string', default: '' },
    { key: 'invokeCommand', type: 'string', default: '' },
    { key: 'previewCommand', type: 'string', default: '' },
    { key: 'clearCommand', type: 'string', default: '' },
    { key: 'clearVideolayerCommand', type: 'string', default: '' },
    { key: 'clearChannelCommand', type: 'string', default: '' },
    { key: 'triggeronnext', type: 'bool', default: false }
  ],
  widgetFields: [COLOR_FIELD],
  inspector: [
    {
      title: 'Custom command',
      controls: [
        { kind: 'text', key: 'playCommand', label: 'Play' },
        { kind: 'text', key: 'stopCommand', label: 'Stop' },
        { kind: 'text', key: 'loadCommand', label: 'Load' },
        { kind: 'text', key: 'pauseCommand', label: 'Pause' },
        { kind: 'text', key: 'nextCommand', label: 'Next' },
        { kind: 'text', key: 'updateCommand', label: 'Update' },
        { kind: 'text', key: 'invokeCommand', label: 'Invoke' },
        { kind: 'text', key: 'previewCommand', label: 'Preview' },
        { kind: 'text', key: 'clearCommand', label: 'Clear' },
        { kind: 'text', key: 'clearVideolayerCommand', label: 'Clear Video layer' },
        { kind: 'text', key: 'clearChannelCommand', label: 'Clear Channel' },
        { kind: 'bool', key: 'triggeronnext', label: 'Trigger on next' }
      ]
    }
  ],
  hiddenCommonBlocks: ['channel', 'layer'],
  triggerOnNext: (p) => p.triggeronnext,
  triggers: {
    ...NEXT_ADVANCES,
    PauseResume: () => ({ op: 'pause' }),
    Update: () => SCHEDULED_UPDATE
  },
  ops: NO_AMCP,
  effects: {
    play: sendCommand('playCommand'),
    stop: sendCommand('stopCommand'),
    load: sendCommand('loadCommand'),
    pause: sendCommand('pauseCommand'),
    next: sendCommand('nextCommand'),
    update: sendCommand('updateCommand'),
    invoke: sendCommand('invokeCommand'),
    preview: sendCommand('previewCommand'),
    clear: sendCommand('clearCommand'),
    clearVideolayer: sendCommand('clearVideolayerCommand'),
    clearChannel: sendCommand('clearChannelCommand')
  }
});

// ---------------------------------------------------------------- HTTPGET / HTTPPOST

type HttpEffect = Extract<SideEffect, { kind: 'http' }>;

export type HttpProps = ItemProps<{
  url: string;
  triggeronnext: boolean;
  /** JSON `[{"key": "...", "value": "..."}]`, nested `<httpdata>` elements in the XML. */
  httpdata: string;
  color: string;
}>;

const HTTP_MEMBERS = ['key', 'value'] as const;

/** Nothing is scheduled without a URL. */
const requireUrl: TriggerFn<HttpProps> = ({ p }) => (p.url ? undefined : IGNORED);

function httpItem(type: 'HTTPGET' | 'HTTPPOST', method: HttpEffect['method'], title: string) {
  return defineItem<HttpProps>({
    type,
    title,
    category: 'output',
    color: ROW_COLORS.http,
    fields: [
      { key: 'url', type: 'string', default: '' },
      { key: 'triggeronnext', type: 'bool', default: false },
      { key: 'httpdata', type: 'list', default: '', entry: 'componentdata', members: HTTP_MEMBERS }
    ],
    widgetFields: [COLOR_FIELD],
    inspector: [
      {
        title,
        controls: [
          { kind: 'text', key: 'url', label: 'URL' },
          { kind: 'bool', key: 'triggeronnext', label: 'Trigger on next' }
        ]
      }
    ],
    hiddenCommonBlocks: ['device', 'channel', 'layer', 'duration'],
    durationless: true,
    triggerOnNext: (p) => p.triggeronnext,
    triggers: { ...NO_PAUSE, Play: requireUrl, Update: requireUrl },
    ops: NO_AMCP,
    effects: {
      play: ({ p }) => (p.url ? [{ kind: 'http', method, url: p.url, data: parseList(p.httpdata, HTTP_MEMBERS).map(({ key, value }) => ({ key, value })) }] : [])
    }
  });
}

export const httpGet = httpItem('HTTPGET', 'GET', 'HTTP GET');
export const httpPost = httpItem('HTTPPOST', 'POST', 'HTTP POST');

// ---------------------------------------------------------------- OSCOUTPUT

export type OscOutputProps = ItemProps<{
  output: string;
  path: string;
  message: string;
  osctype: string;
  triggeronnext: boolean;
  usebundle: boolean;
  color: string;
}>;

/** Nothing is scheduled without an output and a path. */
const requireTarget: TriggerFn<OscOutputProps> = ({ p }) => (p.output && p.path ? undefined : IGNORED);

export const oscOutput = defineItem<OscOutputProps>({
  type: 'OSCOUTPUT',
  title: 'OSC output',
  category: 'output',
  color: ROW_COLORS.gpi,
  fields: [
    { key: 'output', type: 'string', default: '' },
    { key: 'path', type: 'string', default: '' },
    { key: 'message', type: 'string', default: '' },
    { key: 'osctype', type: 'string', default: 'String' },
    { key: 'triggeronnext', type: 'bool', default: false },
    { key: 'usebundle', type: 'bool', default: false }
  ],
  widgetFields: [COLOR_FIELD],
  inspector: [
    {
      title: 'OSC output',
      controls: [
        { kind: 'select', key: 'output', label: 'Output', options: { lookup: 'oscoutput' } },
        { kind: 'text', key: 'path', label: 'Path' },
        { kind: 'text', key: 'message', label: 'Message' },
        { kind: 'select', key: 'osctype', label: 'Type', options: ['Boolean', 'Double', 'Float', 'Integer', 'String'] },
        { kind: 'bool', key: 'triggeronnext', label: 'Trigger on next' },
        { kind: 'bool', key: 'usebundle', label: 'Use bundle' }
      ]
    }
  ],
  hiddenCommonBlocks: ['device', 'channel', 'layer', 'duration'],
  durationless: true,
  triggerOnNext: (p) => p.triggeronnext,
  triggers: { ...NO_PAUSE, Play: requireTarget, Update: requireTarget },
  ops: NO_AMCP,
  effects: {
    play: ({ p }) =>
      p.output && p.path ? [{ kind: 'osc', output: p.output, path: p.path, type: p.osctype, value: p.message, useBundle: p.usebundle }] : []
  }
});

// ---------------------------------------------------------------- GPIOUTPUT

export type GpiOutputProps = ItemProps<{ gpoport: number; triggeronnext: boolean; color: string }>;

export const gpiOutput = defineItem<GpiOutputProps>({
  type: 'GPIOUTPUT',
  title: 'GPI output',
  category: 'output',
  color: ROW_COLORS.gpi,
  fields: [
    { key: 'gpoport', type: 'int', default: 0 },
    { key: 'triggeronnext', type: 'bool', default: false }
  ],
  widgetFields: [COLOR_FIELD],
  inspector: [
    {
      title: 'GPI output',
      controls: [
        // Stored zero based, the Qt inspector shows 1-8.
        { kind: 'int', key: 'gpoport', label: 'GPO port (0-7)', min: 0, max: 7 },
        { kind: 'bool', key: 'triggeronnext', label: 'Trigger on next' }
      ]
    }
  ],
  hiddenCommonBlocks: ['device', 'channel', 'layer', 'duration'],
  durationless: true,
  triggerOnNext: (p) => p.triggeronnext,
  triggers: NO_PAUSE,
  ops: NO_AMCP,
  effects: { play: ({ p }) => [{ kind: 'gpo', port: p.gpoport }] }
});
