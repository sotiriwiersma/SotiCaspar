import { describe, expect, it } from 'vitest';
import {
  IDLE_STATE,
  buildCommands,
  createItem,
  getItemDefinition,
  parseRundown,
  parseTemplateData,
  premultipliedColor,
  resolveTrigger,
  serializeRundown,
  stringifyTemplateData,
  templateDataString
} from '../src';
import type { ItemState, PlayoutOp, Props } from '../src';

const main = { name: 'Local', previewChannel: 2 };
const LOADED: ItemState = { loaded: true, paused: false, playing: false };

type Field = [key: string, value: string];

/** Writes an item like QXmlStreamWriter does in the Qt client: base properties, command properties, widget properties. */
function qtItem(type: string, name: string, videolayer: number, fields: Field[]): string {
  const base: Field[] = [
    ['channel', '1'],
    ['videolayer', String(videolayer)],
    ['delay', '0'],
    ['duration', '0'],
    ['allowgpi', 'false'],
    ['allowremotetriggering', 'false'],
    ['remotetriggerid', ''],
    ['storyid', '']
  ];
  const head: Field[] = [['type', type], ['devicename', 'Local'], ['label', name], ['name', name]];
  const lines = [...head, ...base, ...fields].map(([k, v]) => `        <${k}>${v}</${k}>\n`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<items>\n    <allowremotetriggering>false</allowremotetriggering>\n    <item>\n${lines.join('')}    </item>\n</items>\n`;
}

const transition: Field[] = [
  ['transition', 'MIX'],
  ['transitionDuration', '12'],
  ['tween', 'EaseInQuad'],
  ['direction', 'LEFT']
];
const color: Field = ['color', 'Transparent'];

/** The nested elements the Qt client writes for the template data, between `sendasjson` and `color`. */
const TEMPLATE_DATA = `        <templatedata>
            <componentdata>
                <id>f0</id>
                <value>Hello &amp; "you" &lt;1&gt;</value>
            </componentdata>
            <componentdata>
                <id>f1</id>
                <value></value>
            </componentdata>
        </templatedata>
`;

const templateFields: Field[] = [
  ['flashlayer', '2'],
  ['invoke', 'go'],
  ['usestoreddata', 'false'],
  ['useuppercasedata', 'true'],
  ['triggeronnext', 'false'],
  ['sendasjson', 'false']
];

const SAMPLES: Record<string, string> = {
  STILL: qtItem('STILL', 'LOGO', 10, [...transition, ['useauto', 'true'], ['triggeronnext', 'false'], color]),
  AUDIO: qtItem('AUDIO', 'MUSIC', 30, [...transition, ['loop', 'true'], ['useauto', 'false'], ['triggeronnext', 'true'], color]),
  HTML: qtItem('HTML', 'HTML Page', 10, [
    ['url', 'http://localhost/page?a=1&amp;b=2'],
    ...transition,
    ['freezeonload', 'true'],
    ['triggeronnext', 'false'],
    ['useauto', 'true'],
    color
  ]),
  IMAGESCROLLER: qtItem('IMAGESCROLLER', 'CREDITS', 10, [
    ['blur', '3'],
    ['speed', '12'],
    ['premultiply', 'true'],
    ['progressive', 'false'],
    color
  ]),
  SOLIDCOLOR: qtItem('SOLIDCOLOR', 'Solid Color', 10, [...transition, ['solidcolor', '#80FF8000'], ['useauto', 'false'], ['triggeronnext', 'true'], color]),
  DECKLINKINPUT: qtItem('DECKLINKINPUT', 'DeckLink Input', 10, [['device', '3'], ['format', '1080i5000'], ...transition, color]),
  ROUTECHANNEL: qtItem('ROUTECHANNEL', 'Route Channel', 10, [['fromchannel', '2'], ['outputdelay', '5'], color]),
  ROUTEVIDEOLAYER: qtItem('ROUTEVIDEOLAYER', 'Route Videolayer', 10, [['fromchannel', '2'], ['fromvideolayer', '4'], ['outputdelay', '0'], color]),
  TEMPLATE: qtItem('TEMPLATE', 'LOWERTHIRD', 20, [...templateFields, color]),
  TEMPLATE_WITH_DATA: qtItem('TEMPLATE', 'LOWERTHIRD', 20, [...templateFields, ['templatedata', '@@'], color]).replace(
    '        <templatedata>@@</templatedata>\n',
    TEMPLATE_DATA
  )
};

function plan(type: string, props: Props, op: PlayoutOp, state: ItemState = IDLE_STATE, name = 'CLIP') {
  const item = createItem(type, { name, props });
  return buildCommands(getItemDefinition(type)!, item, op, state, { main, shadows: [] }).flatMap((d) => d.commands);
}

describe('producer rundown XML', () => {
  for (const [type, xml] of Object.entries(SAMPLES)) {
    it(`round trips a Qt ${type} item`, () => {
      expect(serializeRundown(parseRundown(xml))).toBe(xml);
    });
  }

  it('reads typed properties', () => {
    const solid = parseRundown(SAMPLES.SOLIDCOLOR).items[0] as any;
    expect(solid.props).toMatchObject({ transitionDuration: 12, solidcolor: '#80FF8000', triggeronnext: true, color: 'Transparent' });
    const html = parseRundown(SAMPLES.HTML).items[0] as any;
    expect(html.props.url).toBe('http://localhost/page?a=1&b=2');
  });

  it('applies the Qt defaults', () => {
    expect(createItem('DECKLINKINPUT').props).toMatchObject({ device: 2, format: 'PAL' });
    expect(createItem('IMAGESCROLLER').props).toMatchObject({ blur: 0, speed: 8 });
    expect(createItem('SOLIDCOLOR').props.solidcolor).toBe('#FF000000');
    expect(createItem('ROUTEVIDEOLAYER').props).toMatchObject({ fromchannel: 1, fromvideolayer: 1, outputdelay: 0 });
    expect(createItem('TEMPLATE').props.flashlayer).toBe(1);
  });

  it('creates audio and template items on their own default layers, but reads a missing layer as 10', () => {
    expect(createItem('AUDIO').props.videolayer).toBe(30);
    expect(createItem('TEMPLATE').props.videolayer).toBe(20);
    expect(createItem('MOVIE').props.videolayer).toBe(10);
    const missing = (type: string) => parseRundown(`<items><item><type>${type}</type></item></items>`).items[0].props.videolayer;
    expect(missing('AUDIO')).toBe(10);
    expect(missing('TEMPLATE')).toBe(10);
  });

  it('reads and writes the nested template data', () => {
    const item = parseRundown(SAMPLES.TEMPLATE_WITH_DATA).items[0];
    expect(parseTemplateData(String(item.props.templatedata))).toEqual([
      { id: 'f0', value: 'Hello & "you" <1>' },
      { id: 'f1', value: '' }
    ]);
    // A single entry is a list as well.
    const single = SAMPLES.TEMPLATE_WITH_DATA.replace(/ {12}<componentdata>\n {16}<id>f1<\/id>\n {16}<value><\/value>\n {12}<\/componentdata>\n/, '');
    expect(parseTemplateData(String(parseRundown(single).items[0].props.templatedata))).toHaveLength(1);
    expect(serializeRundown(parseRundown(single))).toBe(single);
  });

  it('writes no templatedata element for an empty list', () => {
    expect(serializeRundown(parseRundown(SAMPLES.TEMPLATE))).not.toContain('templatedata');
    const item = createItem('TEMPLATE', { props: { templatedata: stringifyTemplateData([]) } });
    expect(serializeRundown({ allowRemoteTriggering: false, items: [item] })).not.toContain('templatedata');
  });
});

describe('STILL', () => {
  it('plays, loads and previews like the Qt widget', () => {
    expect(plan('STILL', {}, 'play')).toEqual(['PLAY 1-10 "CLIP" CUT 0 Linear RIGHT']);
    expect(plan('STILL', { useauto: true, transition: 'MIX', transitionDuration: 12 }, 'play')).toEqual([
      'LOADBG 1-10 "CLIP" MIX 12 Linear RIGHT AUTO'
    ]);
    expect(plan('STILL', {}, 'play', LOADED)).toEqual(['PLAY 1-10']);
    expect(plan('STILL', { useauto: true }, 'load')).toEqual(['LOADBG 1-10 "CLIP" CUT 0 Linear RIGHT AUTO']);
    // The preview plays directly, even when the item uses auto.
    expect(plan('STILL', { useauto: true }, 'preview')).toEqual(['PLAY 2-10 "CLIP" CUT 0 Linear RIGHT']);
  });

  it('resumes with PLAY and mirrors stop to the preview channel', () => {
    expect(plan('STILL', {}, 'resume')).toEqual(['PLAY 1-10']);
    expect(plan('STILL', {}, 'stop')).toEqual(['STOP 1-10', 'STOP 2-10']);
  });

  it('is played by Next only with trigger on next, and ignores Update', () => {
    const def = getItemDefinition('STILL')!;
    const item = createItem('STILL', { name: 'CLIP' });
    expect(resolveTrigger(def, item, 'Play', IDLE_STATE)).toEqual({ op: 'play', scheduled: true });
    expect(resolveTrigger(def, item, 'Update', IDLE_STATE).op).toBeNull();
    expect(resolveTrigger(def, item, 'Next', IDLE_STATE).op).toBeNull();
    item.props.triggeronnext = true;
    expect(resolveTrigger(def, item, 'Play', IDLE_STATE).op).toBeNull();
    expect(resolveTrigger(def, item, 'Next', IDLE_STATE)).toEqual({ op: 'play' });
  });

  it('pauses and resumes only while playing', () => {
    const def = getItemDefinition('STILL')!;
    const item = createItem('STILL', { name: 'CLIP' });
    expect(resolveTrigger(def, item, 'PauseResume', IDLE_STATE).op).toBeNull();
    expect(resolveTrigger(def, item, 'PauseResume', { loaded: false, paused: false, playing: true }).op).toBe('pause');
    expect(resolveTrigger(def, item, 'PauseResume', { loaded: false, paused: true, playing: true }).op).toBe('resume');
  });
});

describe('AUDIO', () => {
  it('plays and loads with loop and auto', () => {
    const props = { videolayer: 30, loop: true };
    expect(plan('AUDIO', props, 'play', IDLE_STATE, 'MUSIC')).toEqual(['PLAY 1-30 "MUSIC" CUT 0 Linear RIGHT LOOP']);
    expect(plan('AUDIO', { ...props, useauto: true }, 'play', IDLE_STATE, 'MUSIC')).toEqual([
      'LOADBG 1-30 "MUSIC" CUT 0 Linear RIGHT LOOP AUTO'
    ]);
    expect(plan('AUDIO', props, 'load', IDLE_STATE, 'MUSIC')).toEqual(['LOADBG 1-30 "MUSIC" CUT 0 Linear RIGHT LOOP']);
    expect(plan('AUDIO', props, 'play', LOADED)).toEqual(['PLAY 1-30']);
    expect(plan('AUDIO', props, 'resume')).toEqual(['RESUME 1-30']);
  });

  it('cannot be previewed', () => {
    expect(plan('AUDIO', {}, 'preview')).toEqual([]);
  });
});

describe('HTML', () => {
  const props = { url: 'http://localhost/page' };

  it('plays, loads and previews', () => {
    expect(plan('HTML', props, 'play')).toEqual(['PLAY 1-10 [HTML] "http://localhost/page" CUT 0 Linear RIGHT']);
    expect(plan('HTML', { ...props, useauto: true }, 'play')).toEqual([
      'LOADBG 1-10 [HTML] "http://localhost/page" CUT 0 Linear RIGHT AUTO'
    ]);
    expect(plan('HTML', { ...props, freezeonload: true }, 'load')).toEqual(['LOAD 1-10 [HTML] "http://localhost/page" CUT 0 Linear RIGHT']);
    expect(plan('HTML', props, 'load')).toEqual(['LOADBG 1-10 [HTML] "http://localhost/page" CUT 0 Linear RIGHT']);
    expect(plan('HTML', props, 'preview')).toEqual(['LOAD 2-10 [HTML] "http://localhost/page" CUT 0 Linear RIGHT']);
  });

  it('stops the layer for every clear trigger', () => {
    const def = getItemDefinition('HTML')!;
    const item = createItem('HTML');
    expect(resolveTrigger(def, item, 'ClearChannel', IDLE_STATE).op).toBe('clearChannel');
    expect(plan('HTML', props, 'clearVideolayer')).toEqual(['STOP 1-10', 'STOP 2-10']);
    expect(plan('HTML', props, 'clearChannel')).toEqual(['STOP 1-10', 'STOP 2-10']);
  });
});

describe('IMAGESCROLLER', () => {
  it('plays and loads with blur, speed and flags', () => {
    expect(plan('IMAGESCROLLER', {}, 'play', IDLE_STATE, 'CREDITS')).toEqual(['PLAY 1-10 "CREDITS" BLUR 0 SPEED 8']);
    const props = { blur: 3, speed: 12, premultiply: true, progressive: true };
    expect(plan('IMAGESCROLLER', props, 'play', IDLE_STATE, 'CREDITS')).toEqual([
      'PLAY 1-10 "CREDITS" BLUR 3 SPEED 12 PREMULTIPLY PROGRESSIVE'
    ]);
    expect(plan('IMAGESCROLLER', props, 'load', IDLE_STATE, 'CREDITS')).toEqual([
      'LOADBG 1-10 "CREDITS" BLUR 3 SPEED 12 PREMULTIPLY PROGRESSIVE'
    ]);
    expect(plan('IMAGESCROLLER', props, 'play', LOADED)).toEqual(['PLAY 1-10']);
  });

  it('is always played by Play, never by Next, and ignores Update', () => {
    const def = getItemDefinition('IMAGESCROLLER')!;
    const item = createItem('IMAGESCROLLER');
    expect(resolveTrigger(def, item, 'Play', IDLE_STATE)).toEqual({ op: 'play', scheduled: true });
    expect(resolveTrigger(def, item, 'Next', IDLE_STATE).op).toBeNull();
    expect(resolveTrigger(def, item, 'Update', IDLE_STATE).op).toBeNull();
    expect(resolveTrigger(def, item, 'Preview', IDLE_STATE).op).toBeNull();
  });
});

describe('SOLIDCOLOR', () => {
  it('premultiplies the colour like Qt', () => {
    expect(premultipliedColor('#FF000000')).toBe('#ff000000');
    expect(premultipliedColor('#80FF8000')).toBe('#80804000');
    expect(premultipliedColor('#00FFFFFF')).toBe('#00000000');
  });

  it('plays and previews the premultiplied colour', () => {
    const props = { solidcolor: '#80FF8000' };
    expect(plan('SOLIDCOLOR', props, 'play')).toEqual(['PLAY 1-10 "#80804000" CUT 0 Linear RIGHT']);
    expect(plan('SOLIDCOLOR', { ...props, useauto: true, transition: 'MIX', transitionDuration: 12 }, 'play')).toEqual([
      'LOADBG 1-10 "#80804000" MIX 12 Linear RIGHT AUTO'
    ]);
    expect(plan('SOLIDCOLOR', { ...props, useauto: true }, 'preview')).toEqual(['LOADBG 2-10 "#80804000" CUT 0 Linear RIGHT']);
    expect(plan('SOLIDCOLOR', props, 'resume')).toEqual(['PLAY 1-10']);
  });

  it('delays Load like Play, always plays on Next and ignores Update', () => {
    const def = getItemDefinition('SOLIDCOLOR')!;
    const item = createItem('SOLIDCOLOR', { props: { triggeronnext: true } });
    expect(resolveTrigger(def, item, 'Load', IDLE_STATE)).toEqual({ op: 'play', scheduled: true });
    expect(resolveTrigger(def, item, 'Play', IDLE_STATE).op).toBeNull();
    expect(resolveTrigger(def, item, 'Next', IDLE_STATE)).toEqual({ op: 'play' });
    expect(resolveTrigger(def, createItem('SOLIDCOLOR'), 'Next', IDLE_STATE)).toEqual({ op: 'play' });
    expect(resolveTrigger(def, item, 'Update', IDLE_STATE).op).toBeNull();
  });

  it('does not mirror stop and clear to the preview channel', () => {
    expect(plan('SOLIDCOLOR', {}, 'stop')).toEqual(['STOP 1-10']);
    expect(plan('SOLIDCOLOR', {}, 'clearVideolayer')).toEqual(['CLEAR 1-10']);
  });
});

describe('DECKLINKINPUT', () => {
  it('plays and loads the device input', () => {
    expect(plan('DECKLINKINPUT', {}, 'play')).toEqual(['PLAY 1-10 DECKLINK DEVICE 2 FORMAT PAL']);
    expect(plan('DECKLINKINPUT', { device: 3, format: '1080i5000' }, 'load')).toEqual([
      'LOADBG 1-10 DECKLINK DEVICE 3 FORMAT 1080i5000'
    ]);
    expect(plan('DECKLINKINPUT', {}, 'play', LOADED)).toEqual(['PLAY 1-10']);
    expect(plan('DECKLINKINPUT', {}, 'preview')).toEqual([]);
  });
});

describe('ROUTECHANNEL', () => {
  it('only sends FRAMES_DELAY when an output delay is set', () => {
    expect(plan('ROUTECHANNEL', { fromchannel: 3 }, 'play')).toEqual(['PLAY 1-10 route://3']);
    expect(plan('ROUTECHANNEL', { fromchannel: 3, outputdelay: 5 }, 'play')).toEqual(['PLAY 1-10 route://3 FRAMES_DELAY 5']);
    expect(plan('ROUTECHANNEL', { fromchannel: 3 }, 'load')).toEqual(['LOADBG 1-10 route://3']);
    expect(plan('ROUTECHANNEL', { fromchannel: 3, outputdelay: 5 }, 'load')).toEqual(['LOADBG 1-10 route://3 FRAMES_DELAY 5']);
    expect(plan('ROUTECHANNEL', { fromchannel: 3 }, 'play', LOADED)).toEqual(['PLAY 1-10']);
  });
});

describe('ROUTEVIDEOLAYER', () => {
  it('routes a video layer with optional output delay', () => {
    const props = { fromchannel: 3, fromvideolayer: 4 };
    expect(plan('ROUTEVIDEOLAYER', props, 'play')).toEqual(['PLAY 1-10 route://3-4']);
    expect(plan('ROUTEVIDEOLAYER', { ...props, outputdelay: 2 }, 'play')).toEqual(['PLAY 1-10 route://3-4 FRAMES_DELAY 2']);
    expect(plan('ROUTEVIDEOLAYER', { ...props, outputdelay: 2 }, 'load')).toEqual(['LOADBG 1-10 route://3-4 FRAMES_DELAY 2']);
    expect(plan('ROUTEVIDEOLAYER', props, 'pause')).toEqual(['PAUSE 1-10']);
    expect(plan('ROUTEVIDEOLAYER', props, 'clearChannel')).toEqual(['CLEAR 1', 'MIXER 1 CLEAR']);
    expect(resolveTrigger(getItemDefinition('ROUTEVIDEOLAYER')!, createItem('ROUTEVIDEOLAYER'), 'Update', IDLE_STATE).op).toBeNull();
  });
});

describe('TEMPLATE', () => {
  const base = { videolayer: 20, flashlayer: 1 };
  const entries = [{ id: 'f0', value: 'Hello & "you"' }];

  it('builds the template data string like the Qt client', () => {
    const data = (p: Partial<Parameters<typeof templateDataString>[0]>) =>
      templateDataString({ templatedata: stringifyTemplateData(entries), usestoreddata: false, sendasjson: false, useuppercasedata: false, ...p });

    expect(data({})).toBe(
      String.raw`<templateData><componentData id=\"f0\"><data id=\"text\" value=\"Hello &amp; &quot;you&quot;\"/></componentData></templateData>`
    );
    expect(data({ useuppercasedata: true })).toBe(
      String.raw`<templateData><componentData id=\"f0\"><data id=\"text\" value=\"HELLO &AMP; &QUOT;YOU&QUOT;\"/></componentData></templateData>`
    );
    expect(data({ templatedata: '' })).toBe('<templateData></templateData>');
    expect(data({ sendasjson: true })).toBe(String.raw`{\"f0\":\"Hello & \\"you\\"\"}`);
    expect(
      data({
        sendasjson: true,
        useuppercasedata: true,
        templatedata: stringifyTemplateData([{ id: 'b', value: 'x' }, { id: 'a', value: 'y' }])
      })
    ).toBe(String.raw`{\"a\":\"Y\",\"b\":\"X\"}`);
    expect(data({ sendasjson: true, templatedata: '' })).toBe('{}');
    expect(data({ usestoreddata: true, templatedata: stringifyTemplateData([{ id: 'f0', value: '<templateData/>' }]) })).toBe('<templateData/>');
    expect(data({ usestoreddata: true, templatedata: '' })).toBe('');
  });

  it('keeps data entries through stringify and parse', () => {
    expect(parseTemplateData(stringifyTemplateData(entries))).toEqual(entries);
    expect(parseTemplateData('not json')).toEqual([]);
  });

  it('plays, loads and previews with and without data', () => {
    const stored = { ...base, usestoreddata: true };
    expect(plan('TEMPLATE', stored, 'play', IDLE_STATE, 'TPL')).toEqual(['CG 1-20 ADD 1 "TPL" 1']);
    expect(plan('TEMPLATE', stored, 'preview', IDLE_STATE, 'TPL')).toEqual(['CG 2-20 ADD 1 "TPL" 1']);
    expect(plan('TEMPLATE', stored, 'load', IDLE_STATE, 'TPL')).toEqual(['CG 1-20 ADD 1 "TPL" 0']);
    expect(plan('TEMPLATE', base, 'play', LOADED)).toEqual(['CG 1-20 PLAY 1']);

    const json = { ...base, sendasjson: true, templatedata: stringifyTemplateData([{ id: 'a', value: 'x' }]) };
    expect(plan('TEMPLATE', json, 'play', IDLE_STATE, 'TPL')).toEqual([String.raw`CG 1-20 ADD 1 "TPL" 1 "{\"a\":\"x\"}"`]);
    // The Qt client leaves the template name unquoted when data is added without playing.
    expect(plan('TEMPLATE', json, 'load', IDLE_STATE, 'TPL')).toEqual([String.raw`CG 1-20 ADD 1 TPL 0 "{\"a\":\"x\"}"`]);
    expect(plan('TEMPLATE', json, 'update')).toEqual([String.raw`CG 1-20 UPDATE 1 "{\"a\":\"x\"}"`]);
  });

  it('stops, nexts, invokes and removes through CG, mirrored to the preview channel', () => {
    expect(plan('TEMPLATE', base, 'stop')).toEqual(['CG 1-20 STOP 1', 'CG 2-20 STOP 1']);
    expect(plan('TEMPLATE', base, 'next')).toEqual(['CG 1-20 NEXT 1']);
    expect(plan('TEMPLATE', { ...base, invoke: 'say "hi"' }, 'invoke')).toEqual([String.raw`CG 1-20 INVOKE 1 "say \"hi\""`]);
    expect(plan('TEMPLATE', base, 'clear')).toEqual(['CG 1-20 REMOVE 1', 'CG 2-20 REMOVE 1']);
    expect(plan('TEMPLATE', base, 'clearVideolayer')).toEqual(['CLEAR 1-20', 'CLEAR 2-20']);
    expect(plan('TEMPLATE', base, 'stopPreview')).toEqual(['CG 2-20 STOP 1']);
  });

  it('resolves triggers like the Qt widget', () => {
    const def = getItemDefinition('TEMPLATE')!;
    const item = createItem('TEMPLATE', { name: 'TPL' });
    const playing = { loaded: false, paused: false, playing: true };
    expect(resolveTrigger(def, item, 'Play', IDLE_STATE)).toEqual({ op: 'play', scheduled: true });
    expect(resolveTrigger(def, item, 'Update', IDLE_STATE)).toEqual({ op: 'update', scheduled: true });
    expect(resolveTrigger(def, item, 'Preview', IDLE_STATE)).toEqual({ op: 'preview', scheduled: true });
    expect(resolveTrigger(def, item, 'Next', IDLE_STATE)).toEqual({ op: 'next' });
    expect(resolveTrigger(def, item, 'Invoke', IDLE_STATE)).toEqual({ op: 'invoke' });
    expect(resolveTrigger(def, item, 'Clear', IDLE_STATE)).toEqual({ op: 'clear' });
    expect(resolveTrigger(def, item, 'PauseResume', playing).op).toBeNull();

    item.props.triggeronnext = true;
    expect(resolveTrigger(def, item, 'Play', IDLE_STATE).op).toBeNull();
    expect(resolveTrigger(def, item, 'Next', IDLE_STATE)).toEqual({ op: 'play' });
    expect(resolveTrigger(def, item, 'Update', IDLE_STATE)).toEqual({ op: 'update', scheduled: true });

    item.props.delay = -1;
    expect(resolveTrigger(def, item, 'Update', IDLE_STATE).op).toBeNull();
    expect(resolveTrigger(def, item, 'Preview', IDLE_STATE).op).toBeNull();
    expect(resolveTrigger(def, item, 'Next', IDLE_STATE)).toEqual({ op: 'play' });
  });
});

describe('trigger semantics per producer', () => {
  const PLAYING: ItemState = { loaded: false, paused: false, playing: true };
  const op = (type: string, trigger: Parameters<typeof resolveTrigger>[2], state = IDLE_STATE) =>
    resolveTrigger(getItemDefinition(type)!, createItem(type), trigger, state).op;

  it('delays Update like Play only where the Qt widget handles it', () => {
    for (const type of ['MOVIE', 'AUDIO', 'HTML']) expect(op(type, 'Update'), type).toBe('play');
    for (const type of ['STILL', 'IMAGESCROLLER', 'SOLIDCOLOR', 'DECKLINKINPUT', 'ROUTECHANNEL', 'ROUTEVIDEOLAYER']) {
      expect(op(type, 'Update'), type).toBeNull();
    }
  });

  it('only previews the producers that have a preview', () => {
    for (const type of ['MOVIE', 'STILL', 'HTML', 'SOLIDCOLOR']) expect(op(type, 'Preview'), type).toBe('preview');
    for (const type of ['AUDIO', 'IMAGESCROLLER', 'DECKLINKINPUT', 'ROUTECHANNEL', 'ROUTEVIDEOLAYER']) expect(op(type, 'Preview'), type).toBeNull();
  });

  it('pauses the producers that can be paused', () => {
    for (const type of ['MOVIE', 'AUDIO', 'STILL', 'HTML', 'SOLIDCOLOR', 'IMAGESCROLLER', 'DECKLINKINPUT', 'ROUTECHANNEL', 'ROUTEVIDEOLAYER']) {
      expect(op(type, 'PauseResume', PLAYING), type).toBe('pause');
    }
  });

  it('mirrors stop and clear to the preview channel only for video, image, HTML and template', () => {
    const mirrored = (type: string) =>
      buildCommands(getItemDefinition(type)!, createItem(type), 'stop', IDLE_STATE, { main, shadows: [] })[0].commands.length;
    for (const type of ['MOVIE', 'STILL', 'HTML']) expect(mirrored(type), type).toBe(2);
    for (const type of ['AUDIO', 'IMAGESCROLLER', 'SOLIDCOLOR', 'DECKLINKINPUT', 'ROUTECHANNEL', 'ROUTEVIDEOLAYER']) {
      expect(mirrored(type), type).toBe(1);
    }
  });

  it('only queues video items in an AutoPlay group and shows their timeline', () => {
    const withHook = (type: string) => getItemDefinition(type)!.autoPlay !== undefined;
    expect(withHook('MOVIE')).toBe(true);
    for (const type of ['AUDIO', 'STILL', 'HTML', 'TEMPLATE', 'SOLIDCOLOR']) expect(withHook(type), type).toBe(false);
    expect(getItemDefinition('MOVIE')!.timeline).toBe(true);
    expect(getItemDefinition('AUDIO')!.timeline).toBeUndefined();
  });
});
