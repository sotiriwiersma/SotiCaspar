import { describe, expect, it } from 'vitest';
import { IDLE_STATE, amcp, buildCommands, buildEffects, createItem, getItemDefinition, parseRundown, resolveTrigger, serializeRundown } from '../src';
import type { PlayoutOp, Props, RundownItem } from '../src';

type Pairs = ReadonlyArray<readonly [string, string]>;

// XML as written by the Qt client: AbstractCommand properties, the command's own, then the widget's `color`.
const base = (override: Record<string, string> = {}): Pairs =>
  [
    ['channel', '1'],
    ['videolayer', '10'],
    ['delay', '0'],
    ['duration', '0'],
    ['allowgpi', 'false'],
    ['allowremotetriggering', 'false'],
    ['remotetriggerid', ''],
    ['storyid', '']
  ].map(([key, value]) => [key, override[key] ?? value] as const);

function itemXml(depth: number, head: Pairs, props: Pairs, nested = ''): string {
  const pad = '    '.repeat(depth);
  const body = [...head, ...props].map(([key, value]) => `${pad}    <${key}>${value}</${key}>\n`).join('');
  return `${pad}<item>\n${body}${nested}${pad}</item>\n`;
}

const leafXml = (type: string, props: Pairs, depth = 1, override: Record<string, string> = {}) =>
  itemXml(depth, [['type', type], ['devicename', 'Local'], ['label', 'Label'], ['name', '']], [...base(override), ...props]);

const rundownXml = (items: string) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<items>\n    <allowremotetriggering>false</allowremotetriggering>\n${items}</items>\n`;

const roundTrip = (xml: string) => serializeRundown(parseRundown(xml));

const CASES: Array<[string, Pairs]> = [
  ['SEPARATOR', [['color', 'Maroon']]],
  ['PLAYOUTCOMMAND', [['playoutcommand', 'Play Now'], ['color', 'Transparent']]],
  [
    'CUSTOMCOMMAND',
    [
      ['stopCommand', 'MIXER 1-10 CLEAR'],
      ['playCommand', 'PLAY 1-10 "A &amp; B"'],
      ['loadCommand', ''],
      ['pauseCommand', 'PAUSE 1-10'],
      ['nextCommand', ''],
      ['updateCommand', ''],
      ['invokeCommand', ''],
      ['previewCommand', ''],
      ['clearCommand', 'CLEAR 1'],
      ['clearVideolayerCommand', 'CLEAR 1-10'],
      ['clearChannelCommand', ''],
      ['triggeronnext', 'true'],
      ['color', 'Transparent']
    ]
  ],
  ['HTTPGET', [['url', 'http://localhost/run?a=1&amp;b=2'], ['triggeronnext', 'false'], ['color', 'Transparent']]],
  ['HTTPPOST', [['url', 'http://localhost/post'], ['triggeronnext', 'true'], ['color', 'Transparent']]],
  [
    'OSCOUTPUT',
    [['output', 'Local OSC'], ['path', '/a/b'], ['message', '1.5'], ['osctype', 'Float'], ['triggeronnext', 'true'], ['usebundle', 'false'], ['color', 'Transparent']]
  ],
  ['GPIOUTPUT', [['gpoport', '3'], ['triggeronnext', 'false'], ['color', 'Transparent']]],
  ['PRINT', [['output', 'Snapshot'], ['color', 'Transparent']]],
  ['CLEAROUTPUT', [['clearchannel', 'false'], ['triggeronnext', 'true'], ['color', 'Transparent']]],
  [
    'FADETOBLACK',
    [
      ['transition', 'MIX'],
      ['transitionDuration', '12'],
      ['tween', 'Linear'],
      ['direction', 'RIGHT'],
      ['useauto', 'true'],
      ['triggeronnext', 'false'],
      ['color', 'Transparent']
    ]
  ],
  [
    'FILERECORDER',
    [
      ['output', 'Take.mp4'],
      ['codec', 'h264'],
      ['preset', '-codec:v libx264 -preset:v veryfast'],
      ['withalpha', 'true'],
      ['color', 'Transparent']
    ]
  ]
];

describe('control item XML', () => {
  const HTTP_DATA =
    '        <httpdata>\n' +
    '            <componentdata>\n                <key>a</key>\n                <value>1 &amp; 2</value>\n            </componentdata>\n' +
    '            <componentdata>\n                <key>b</key>\n                <value></value>\n            </componentdata>\n' +
    '        </httpdata>\n';
  const httpXml = (type: string, data: string) =>
    rundownXml(
      `    <item>\n        <type>${type}</type>\n        <devicename>Local</devicename>\n        <label>Label</label>\n        <name></name>\n` +
        [...base(), ['url', 'http://localhost/run'], ['triggeronnext', 'false']].map(([k, v]) => `        <${k}>${v}</${k}>\n`).join('') +
        `${data}        <color>Transparent</color>\n    </item>\n`
    );

  it.each(['HTTPGET', 'HTTPPOST'])('round trips the nested %s request data byte for byte', (type) => {
    const xml = httpXml(type, HTTP_DATA);
    expect(roundTrip(xml)).toBe(xml);
    const item = parseRundown(xml).items[0] as RundownItem;
    expect(item.props.httpdata).toBe('[{"key":"a","value":"1 & 2"},{"key":"b","value":""}]');
    expect(buildEffects(getItemDefinition(type)!, item, 'play', IDLE_STATE)).toEqual([
      { kind: 'http', method: type === 'HTTPGET' ? 'GET' : 'POST', url: 'http://localhost/run', data: [{ key: 'a', value: '1 & 2' }, { key: 'b', value: '' }] }
    ]);
  });

  it('writes no httpdata element without request data', () => {
    const xml = httpXml('HTTPGET', '');
    expect(roundTrip(xml)).toBe(xml);
    expect(parseRundown(xml).items[0].props.httpdata).toBe('');
  });

  it.each(CASES)('round-trips %s byte for byte', (type, props) => {
    const xml = rundownXml(leafXml(type, props, 1, { channel: '2', delay: '500' }));
    expect(roundTrip(xml)).toBe(xml);
  });

  it('reads typed values', () => {
    const item = parseRundown(rundownXml(leafXml('GPIOUTPUT', [['gpoport', '3'], ['triggeronnext', 'true'], ['color', 'Transparent']]))).items[0];
    expect(item.props).toMatchObject({ gpoport: 3, triggeronnext: true, channel: 1 });
  });

  it('falls back to the Qt defaults for missing elements', () => {
    const xml = rundownXml('    <item>\n        <type>FILERECORDER</type>\n    </item>\n');
    expect(parseRundown(xml).items[0].props).toMatchObject({
      output: 'Output.mxf',
      codec: 'dnxhd',
      preset: '-codec:v dnxhd -b:v 120M -flags:v +ilme+ildct -threads:v 4 -filter:v format=yuv422p,interlace',
      withalpha: false
    });
  });

  it('writes a group with its properties before the nested items', () => {
    const groupProps: Pairs = [...base(), ['notes', 'Cue 1'], ['autostep', 'true'], ['autoplay', 'false'], ['color', 'Transparent']];
    const children =
      leafXml('SEPARATOR', [['color', 'Maroon']], 3) +
      itemXml(3, [['type', 'PRINT'], ['devicename', 'Local'], ['label', 'Shot'], ['name', '']], [...base(), ['output', 'Snapshot'], ['color', 'Transparent']]);
    const xml = rundownXml(
      itemXml(1, [['type', 'GROUP'], ['label', 'Opening'], ['expanded', 'true']], groupProps, `        <items>\n${children}        </items>\n`)
    );

    const rundown = parseRundown(xml);
    const group = rundown.items[0] as any;
    expect(group).toMatchObject({ type: 'GROUP', label: 'Opening', expanded: true, props: { notes: 'Cue 1', autostep: true, autoplay: false } });
    expect(group.items.map((i: any) => i.type)).toEqual(['SEPARATOR', 'PRINT']);
    expect(roundTrip(xml)).toBe(xml);
  });
});

describe('control item playout', () => {
  const main = { name: 'Local', previewChannel: 2 };

  const commands = (type: string, op: PlayoutOp, props: Props = {}, state = IDLE_STATE) =>
    buildCommands(getItemDefinition(type)!, createItem(type, { deviceName: 'Local', props }), op, state, { main, shadows: [] }).flatMap((d) => d.commands);

  const effects = (type: string, op: PlayoutOp, props: Props = {}) =>
    buildEffects(getItemDefinition(type)!, createItem(type, { deviceName: 'Local', props }), op, IDLE_STATE);

  it('prints a snapshot and ignores stop and clear', () => {
    expect(commands('PRINT', 'play')).toEqual(['ADD 1 IMAGE "Snapshot"']);
    expect(commands('PRINT', 'stop')).toEqual([]);
    expect(commands('PRINT', 'clearChannel')).toEqual([]);
  });

  it('clears the channel or the layer depending on the item, without preview mirroring', () => {
    expect(commands('CLEAROUTPUT', 'play')).toEqual(['CLEAR 1', 'MIXER 1 CLEAR']);
    expect(commands('CLEAROUTPUT', 'play', { clearchannel: false })).toEqual(['CLEAR 1-10']);
    expect(commands('CLEAROUTPUT', 'stop')).toEqual([]);
    expect(commands('CLEAROUTPUT', 'clearVideolayer')).toEqual(['CLEAR 1-10']);
    expect(commands('CLEAROUTPUT', 'clearChannel')).toEqual(['CLEAR 1', 'MIXER 1 CLEAR']);
  });

  it('plays a transparent colour for fade to black on the flash layer', () => {
    expect(commands('FADETOBLACK', 'play')).toEqual(['PLAY 1-20 "#00000000" MIX 12 Linear RIGHT']);
    expect(commands('FADETOBLACK', 'play', { useauto: true })).toEqual(['LOADBG 1-20 "#00000000" MIX 12 Linear RIGHT AUTO']);
    expect(commands('FADETOBLACK', 'resume')).toEqual(['PLAY 1-20']);
    expect(commands('FADETOBLACK', 'pause')).toEqual(['PAUSE 1-20']);
    expect(commands('FADETOBLACK', 'stop')).toEqual(['STOP 1-20']);
    expect(commands('FADETOBLACK', 'clearVideolayer')).toEqual(['CLEAR 1-20']);
  });

  it('creates fade to black with MIX/12 but reads a file without those elements as CUT/0', () => {
    expect(createItem('FADETOBLACK').props).toMatchObject({ transition: 'MIX', transitionDuration: 12, videolayer: 20 });
    const read = parseRundown(rundownXml('    <item>\n        <type>FADETOBLACK</type>\n    </item>\n')).items[0];
    expect(read.props).toMatchObject({ transition: 'CUT', transitionDuration: 0, videolayer: 10 });
  });

  it('delays Load like Play and always plays on Next for fade to black', () => {
    const definition = getItemDefinition('FADETOBLACK')!;
    const item = createItem('FADETOBLACK', { props: { triggeronnext: true } });
    expect(resolveTrigger(definition, item, 'Load', IDLE_STATE)).toEqual({ op: 'play', scheduled: true });
    expect(resolveTrigger(definition, item, 'Next', IDLE_STATE)).toEqual({ op: 'play' });
    expect(resolveTrigger(definition, item, 'Update', IDLE_STATE).op).toBeNull();
  });

  it('starts and stops the file recorder', () => {
    const id = amcp.consumerIndex('Output.mxf');
    expect(commands('FILERECORDER', 'play')).toEqual([
      `ADD 1-${id} FILE "Output.mxf" -codec:v dnxhd -b:v 120M -flags:v +ilme+ildct -threads:v 4 -filter:v format=yuv422p,interlace`
    ]);
    expect(commands('FILERECORDER', 'play', { withalpha: true, preset: '' })).toEqual([`ADD 1-${id} FILE "Output.mxf" SEPARATE_KEY`]);
    for (const op of ['stop', 'clearVideolayer', 'clearChannel'] as const) {
      expect(commands('FILERECORDER', op)).toEqual([`REMOVE 1-${id} FILE`]);
    }
  });

  it('sends custom commands per trigger and skips empty ones', () => {
    const props = {
      playCommand: 'PLAY 1-10 "A"',
      stopCommand: 'STOP 1-10',
      pauseCommand: 'PAUSE 1-10',
      clearCommand: 'CLEAR 1',
      clearVideolayerCommand: 'CLEAR 1-10',
      updateCommand: 'UPD'
    };
    expect(effects('CUSTOMCOMMAND', 'play', props)).toEqual([{ kind: 'custom', command: 'PLAY 1-10 "A"' }]);
    expect(effects('CUSTOMCOMMAND', 'stop', props)).toEqual([{ kind: 'custom', command: 'STOP 1-10' }]);
    expect(effects('CUSTOMCOMMAND', 'pause', props)).toEqual([{ kind: 'custom', command: 'PAUSE 1-10' }]);
    expect(effects('CUSTOMCOMMAND', 'update', props)).toEqual([{ kind: 'custom', command: 'UPD' }]);
    expect(effects('CUSTOMCOMMAND', 'clear', props)).toEqual([{ kind: 'custom', command: 'CLEAR 1' }]);
    expect(effects('CUSTOMCOMMAND', 'clearVideolayer', props)).toEqual([{ kind: 'custom', command: 'CLEAR 1-10' }]);
    expect(effects('CUSTOMCOMMAND', 'clearChannel', props)).toEqual([]);
    expect(effects('CUSTOMCOMMAND', 'load', props)).toEqual([]);
    expect(commands('CUSTOMCOMMAND', 'stop', props)).toEqual([]);
  });

  it('resolves the custom command triggers like the Qt widget', () => {
    const definition = getItemDefinition('CUSTOMCOMMAND')!;
    const item = createItem('CUSTOMCOMMAND');
    // PauseResume always sends the pause command, whether or not the item is playing.
    expect(resolveTrigger(definition, item, 'PauseResume', IDLE_STATE)).toEqual({ op: 'pause' });
    expect(resolveTrigger(definition, item, 'PauseResume', { loaded: false, paused: true, playing: true })).toEqual({ op: 'pause' });
    expect(resolveTrigger(definition, item, 'Update', IDLE_STATE)).toEqual({ op: 'update', scheduled: true });
    expect(resolveTrigger(definition, item, 'Next', IDLE_STATE)).toEqual({ op: 'next' });
    expect(resolveTrigger(definition, item, 'Clear', IDLE_STATE)).toEqual({ op: 'clear' });
    expect(resolveTrigger(definition, item, 'ClearVideoLayer', IDLE_STATE)).toEqual({ op: 'clearVideolayer' });
    item.props.triggeronnext = true;
    expect(resolveTrigger(definition, item, 'Next', IDLE_STATE)).toEqual({ op: 'play' });
    expect(resolveTrigger(definition, item, 'Play', IDLE_STATE).op).toBeNull();
  });

  it('ignores the triggers the Qt widgets of the output items do not handle', () => {
    const op = (type: string, trigger: Parameters<typeof resolveTrigger>[2], props: Props = {}) =>
      resolveTrigger(getItemDefinition(type)!, createItem(type, { props }), trigger, { loaded: false, paused: false, playing: true }).op;
    for (const type of ['CLEAROUTPUT', 'FILERECORDER', 'PLAYOUTCOMMAND']) expect(op(type, 'Update'), type).toBeNull();
    for (const type of ['CLEAROUTPUT', 'FILERECORDER', 'HTTPGET', 'OSCOUTPUT', 'GPIOUTPUT', 'PRINT']) expect(op(type, 'PauseResume'), type).toBeNull();
    for (const trigger of ['Stop', 'Next', 'Load', 'Preview', 'Invoke', 'Clear', 'ClearVideoLayer', 'ClearChannel', 'PauseResume'] as const) {
      expect(op('PLAYOUTCOMMAND', trigger), trigger).toBeNull();
    }
    for (const trigger of ['Play', 'PlayNow', 'Stop', 'Clear'] as const) expect(op('SEPARATOR', trigger), trigger).toBeNull();
    expect(op('PLAYOUTCOMMAND', 'Play')).toBe('play');
    expect(op('PLAYOUTCOMMAND', 'PlayNow')).toBe('play');
    expect(op('PRINT', 'Update')).toBe('play');
    expect(op('FILERECORDER', 'Stop')).toBe('stop');
    expect(op('CLEAROUTPUT', 'PlayNow')).toBe('play');
  });

  it('only delays HTTP and OSC output when there is something to send', () => {
    const op = (type: string, trigger: Parameters<typeof resolveTrigger>[2], props: Props) =>
      resolveTrigger(getItemDefinition(type)!, createItem(type, { props }), trigger, IDLE_STATE);
    expect(op('HTTPGET', 'Play', {})).toEqual({ op: null });
    expect(op('HTTPGET', 'Update', {})).toEqual({ op: null });
    expect(op('HTTPPOST', 'Play', { url: 'http://x' })).toEqual({ op: 'play', scheduled: true });
    expect(op('OSCOUTPUT', 'Play', { output: 'A' })).toEqual({ op: null });
    expect(op('OSCOUTPUT', 'Update', { output: 'A', path: '/a' })).toEqual({ op: 'play', scheduled: true });
  });

  it('never stops delayed output after a duration', () => {
    for (const type of ['HTTPGET', 'HTTPPOST', 'OSCOUTPUT', 'GPIOUTPUT', 'PLAYOUTCOMMAND', 'PRINT']) {
      expect(getItemDefinition(type)!.durationless, type).toBe(true);
    }
    expect(getItemDefinition('CLEAROUTPUT')!.durationless).toBeUndefined();
  });

  it('changes the output file name and preset with the recorder codec', () => {
    const control = getItemDefinition('FILERECORDER')!.inspector[0].controls.find((c) => c.key === 'codec');
    const change = control?.kind === 'select' ? control.onChange : undefined;
    expect(change?.('h264', { output: 'Takes\\Show.final.mxf' })).toEqual({
      output: 'Show.final.mp4',
      preset: '-codec:v libx264 -flags:v +ilme+ildct -threads:v 4 -filter:v interlace -preset:v veryfast'
    });
    expect(change?.('dnxhd', { output: 'Take' })).toMatchObject({ output: 'Take.mxf' });
    expect(change?.('prores', { output: 'Take.mxf' })).toEqual({});
  });

  it('keeps only the Qt-disabled blocks hidden in the common inspector', () => {
    const hidden = (type: string) => getItemDefinition(type)!.hiddenCommonBlocks ?? [];
    expect(hidden('MOVIE')).toEqual([]);
    expect(hidden('GROUP')).toEqual(['device', 'channel', 'layer', 'delay', 'duration']);
    expect(hidden('HTTPGET')).toEqual(['device', 'channel', 'layer', 'duration']);
    expect(hidden('PLAYOUTCOMMAND')).toEqual(hidden('HTTPGET'));
    expect(hidden('CUSTOMCOMMAND')).toEqual(['channel', 'layer']);
    expect(hidden('CLEAROUTPUT')).toEqual(['duration']);
    expect(hidden('SEPARATOR')).toHaveLength(7);
  });

  it('fires rundown triggers from the persisted playout command text', () => {
    expect(effects('PLAYOUTCOMMAND', 'play')).toEqual([{ kind: 'rundown', command: 'Play' }]);
    expect(effects('PLAYOUTCOMMAND', 'play', { playoutcommand: 'Play Now' })).toEqual([{ kind: 'rundown', command: 'PlayNow' }]);
    expect(effects('PLAYOUTCOMMAND', 'play', { playoutcommand: 'Pause / Resume' })).toEqual([{ kind: 'rundown', command: 'PauseResume' }]);
    expect(effects('PLAYOUTCOMMAND', 'play', { playoutcommand: 'Clear Channel' })).toEqual([{ kind: 'rundown', command: 'ClearChannel' }]);
    expect(effects('PLAYOUTCOMMAND', 'play', { playoutcommand: 'Bogus' })).toEqual([]);
    expect(effects('PLAYOUTCOMMAND', 'stop')).toEqual([]);
  });

  it('sends HTTP requests only when a URL is set', () => {
    expect(effects('HTTPGET', 'play')).toEqual([]);
    expect(effects('HTTPGET', 'play', { url: 'http://x/y' })).toEqual([{ kind: 'http', method: 'GET', url: 'http://x/y', data: [] }]);
    expect(effects('HTTPPOST', 'play', { url: 'http://x/y', httpdata: '[{"key":"a","value":"1"}]' })).toEqual([
      { kind: 'http', method: 'POST', url: 'http://x/y', data: [{ key: 'a', value: '1' }] }
    ]);
    expect(commands('HTTPGET', 'stop', { url: 'http://x/y' })).toEqual([]);
  });

  it('sends OSC only when output and path are set', () => {
    expect(effects('OSCOUTPUT', 'play', { output: 'Local', path: '' })).toEqual([]);
    expect(effects('OSCOUTPUT', 'play', { output: 'Local', path: '/a', message: '1', osctype: 'Integer', usebundle: true })).toEqual([
      { kind: 'osc', output: 'Local', path: '/a', type: 'Integer', value: '1', useBundle: true }
    ]);
  });

  it('pulses the configured GPO port', () => {
    expect(effects('GPIOUTPUT', 'play', { gpoport: 2 })).toEqual([{ kind: 'gpo', port: 2 }]);
  });

  it('does nothing for groups and separators', () => {
    for (const type of ['GROUP', 'SEPARATOR']) {
      for (const op of ['play', 'stop', 'pause', 'clearVideolayer', 'clearChannel'] as const) {
        expect(commands(type, op)).toEqual([]);
        expect(effects(type, op)).toEqual([]);
      }
    }
  });

  it('defers trigger-on-next items to the Next trigger', () => {
    for (const type of ['HTTPGET', 'OSCOUTPUT', 'GPIOUTPUT', 'CLEAROUTPUT', 'FADETOBLACK', 'CUSTOMCOMMAND']) {
      const item = createItem(type, { props: { triggeronnext: true } });
      const definition = getItemDefinition(type)!;
      expect(resolveTrigger(definition, item, 'Play', IDLE_STATE).op).toBeNull();
      expect(resolveTrigger(definition, item, 'Next', IDLE_STATE).op).toBe('play');
    }
  });
});
