import { describe, expect, it } from 'vitest';
import { buildCommands, createItem, getItemDefinition, IDLE_STATE, parseRundown, resolveTrigger, serializeRundown } from '../src';
import type { PlayoutOp, RundownItem } from '../src';

type Tail = ReadonlyArray<readonly [string, string]>;

/** A rundown with one item, written the way the Qt client's XML writer does (base elements, then the command's own). */
function qtXml(type: string, tail: Tail): string {
  const element = (key: string, value: string) => `        <${key}>${value}</${key}>`;
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<items>',
    '    <allowremotetriggering>false</allowremotetriggering>',
    '    <item>',
    ...[
      ['type', type], ['devicename', 'Local'], ['label', 'Mixer'], ['name', 'Mixer'],
      ['channel', '1'], ['videolayer', '10'], ['delay', '0'], ['duration', '0'], ['allowgpi', 'false'],
      ['allowremotetriggering', 'false'], ['remotetriggerid', ''], ['storyid', ''],
      ...tail,
      ['color', 'Transparent']
    ].map(([key, value]) => element(key, value)),
    '    </item>',
    '</items>',
    ''
  ].join('\n');
}

const TWEEN: Tail = [['transitionDuration', '12'], ['tween', 'EaseInQuad']];
const DEFER_ON: Tail = [['defer', 'true']];

interface MixerCase {
  tail: Tail;
  play: string[];
  stop: string[];
}

/** Command elements in the order of each Qt `writeProperties`, with the commands the widgets send. */
const CASES: Record<string, MixerCase> = {
  ANCHOR: {
    tail: [['positionx', '0.5'], ['positiony', '0.25'], ...TWEEN, ['triggeronnext', 'false'], ...DEFER_ON],
    play: ['MIXER 1-10 ANCHOR 0.5 0.25 12 EaseInQuad DEFER'],
    stop: ['MIXER 1-10 ANCHOR 0 0']
  },
  BLENDMODE: {
    tail: [['blendmode', 'Screen']],
    play: ['MIXER 1-10 BLEND Screen'],
    stop: ['MIXER 1-10 BLEND Normal']
  },
  BRIGHTNESS: {
    tail: [['brightness', '1.5'], ...TWEEN, ...DEFER_ON],
    play: ['MIXER 1-10 BRIGHTNESS 1.5 12 EaseInQuad DEFER'],
    stop: ['MIXER 1-10 BRIGHTNESS 1']
  },
  CHROMAKEY: {
    tail: [['key', 'Green'], ['spread', '0.5'], ['spill', '0.8'], ['threshold', '0.3']],
    play: ['MIXER 1-10 CHROMA Green 0.3 0.5 0.8'],
    stop: ['MIXER 1-10 CHROMA None 0 0 0']
  },
  CLIP: {
    tail: [['left', '0.1'], ['width', '0.8'], ['top', '0.2'], ['height', '0.6'], ...TWEEN, ['defer', 'false']],
    play: ['MIXER 1-10 CLIP 0.1 0.2 0.8 0.6 12 EaseInQuad'],
    stop: ['MIXER 1-10 CLIP 0 0 1 1']
  },
  COMMIT: {
    tail: [],
    play: ['MIXER 1 COMMIT'],
    stop: []
  },
  CONTRAST: {
    tail: [['contrast', '0.75'], ...TWEEN, ['defer', 'false']],
    play: ['MIXER 1-10 CONTRAST 0.75 12 EaseInQuad'],
    stop: ['MIXER 1-10 CONTRAST 1']
  },
  CROP: {
    tail: [['left', '0.1'], ['top', '0.2'], ['right', '0.9'], ['bottom', '0.8'], ...TWEEN, ['defer', 'false']],
    play: ['MIXER 1-10 CROP 0.1 0.2 0.9 0.8 12 EaseInQuad'],
    stop: ['MIXER 1-10 CROP 0 0 1 1']
  },
  FILL: {
    tail: [
      ['positionx', '0.1'], ['positiony', '0.2'], ['scalex', '0.5'], ['scaley', '0.5'], ...TWEEN,
      ['triggeronnext', 'false'], ...DEFER_ON, ['usemipmap', 'true']
    ],
    play: ['MIXER 1-10 MIPMAP 1', 'MIXER 1-10 FILL 0.1 0.2 0.5 0.5 12 EaseInQuad DEFER'],
    stop: ['MIXER 1-10 MIPMAP 0', 'MIXER 1-10 FILL 0 0 1 1']
  },
  GRID: {
    tail: [['grid', '2'], ...TWEEN, ...DEFER_ON],
    play: ['MIXER 1 GRID 2 12 EaseInQuad DEFER'],
    stop: ['MIXER 1-1 CLEAR', 'MIXER 1-2 CLEAR', 'MIXER 1-3 CLEAR', 'MIXER 1-4 CLEAR']
  },
  KEYER: {
    tail: [['defer', '1']],
    play: ['MIXER 1-10 KEYER 1 DEFER'],
    stop: ['MIXER 1-10 KEYER 0']
  },
  LEVELS: {
    tail: [['minin', '0.1'], ['maxin', '0.9'], ['minout', '0.05'], ['maxout', '0.95'], ['gamma', '1.2'], ...TWEEN, ['defer', 'false']],
    play: ['MIXER 1-10 LEVELS 0.1 0.9 1.2 0.05 0.95 12 EaseInQuad'],
    stop: ['MIXER 1-10 LEVELS 0 1 1 0 1']
  },
  OPACITY: {
    tail: [['opacity', '0.5'], ...TWEEN, ['triggeronnext', 'false'], ...DEFER_ON],
    play: ['MIXER 1-10 OPACITY 0.5 12 EaseInQuad DEFER'],
    stop: ['MIXER 1-10 OPACITY 1']
  },
  PERSPECTIVE: {
    tail: [
      ['upperleftx', '0.1'], ['upperlefty', '0.05'], ['upperrightx', '0.9'], ['upperrighty', '0'],
      ['lowerrightx', '1'], ['lowerrighty', '1'], ['lowerleftx', '0'], ['lowerlefty', '0.95'], ...TWEEN,
      ['triggeronnext', 'false'], ['defer', 'false'], ['usemipmap', 'false']
    ],
    play: ['MIXER 1-10 MIPMAP 0', 'MIXER 1-10 PERSPECTIVE 0.1 0.05 0.9 0 1 1 0 0.95 12 EaseInQuad'],
    stop: ['MIXER 1-10 MIPMAP 0', 'MIXER 1-10 PERSPECTIVE 0 0 1 0 1 1 0 1']
  },
  RESET: {
    tail: [],
    play: ['MIXER 1-10 CLEAR'],
    stop: []
  },
  ROTATION: {
    tail: [['rotation', '45'], ...TWEEN, ...DEFER_ON],
    play: ['MIXER 1-10 ROTATION 45 12 EaseInQuad DEFER'],
    stop: ['MIXER 1-10 ROTATION 0']
  },
  SATURATION: {
    tail: [['saturation', '0.25'], ...TWEEN, ['defer', 'false']],
    play: ['MIXER 1-10 SATURATION 0.25 12 EaseInQuad'],
    stop: ['MIXER 1-10 SATURATION 1']
  },
  VOLUME: {
    tail: [['volume', '0.8'], ...TWEEN, ['defer', 'false']],
    play: ['MIXER 1-10 VOLUME 0.8 12 EaseInQuad'],
    stop: ['MIXER 1-10 VOLUME 1']
  }
};

const TYPES = Object.keys(CASES);
const MAIN = { name: 'Local', previewChannel: 0 };

const load = (type: string): RundownItem => parseRundown(qtXml(type, CASES[type].tail)).items[0] as RundownItem;
const commands = (item: RundownItem, op: PlayoutOp, previewChannel = 0) =>
  buildCommands(getItemDefinition(item.type)!, item, op, IDLE_STATE, { main: { ...MAIN, previewChannel }, shadows: [] }).flatMap((d) => d.commands);

describe('mixer items', () => {
  it.each(TYPES)('%s round-trips a Qt rundown file', (type) => {
    const xml = qtXml(type, CASES[type].tail);
    expect(serializeRundown(parseRundown(xml))).toBe(xml);
  });

  it.each(TYPES)('%s sends the Qt commands on play and stop', (type) => {
    const item = load(type);
    expect(commands(item, 'play')).toEqual(CASES[type].play);
    expect(commands(item, 'stop')).toEqual(CASES[type].stop);
  });

  it.each(TYPES.filter((t) => !['COMMIT', 'RESET', 'GRID'].includes(t)))('%s clears only the mixer of the layer', (type) => {
    expect(commands(load(type), 'clearVideolayer')).toEqual(['MIXER 1-10 CLEAR']);
  });

  it.each(TYPES)('%s clears the channel, and never mirrors to the preview channel', (type) => {
    const item = load(type);
    expect(commands(item, 'clearChannel', 3)).toEqual(type === 'COMMIT' || type === 'RESET' ? [] : ['CLEAR 1', 'MIXER 1 CLEAR']);
    expect(commands(item, 'stop', 3)).toEqual(CASES[type].stop);
  });

  it.each(TYPES)('%s resets on Clear exactly like on Stop', (type) => {
    const item = load(type);
    const definition = getItemDefinition(type)!;
    expect(resolveTrigger(definition, item, 'Clear', IDLE_STATE)).toEqual({ op: 'clear' });
    expect(commands(item, 'clear')).toEqual(CASES[type].stop);
  });

  it.each(TYPES)('%s ignores pause/resume', (type) => {
    const playing = { loaded: false, paused: false, playing: true };
    expect(resolveTrigger(getItemDefinition(type)!, load(type), 'PauseResume', playing).op).toBeNull();
  });

  it('treats Load as a delayed play, except for volume, commit and reset which ignore it', () => {
    for (const type of TYPES) {
      const expected = ['VOLUME', 'COMMIT', 'RESET'].includes(type) ? { op: null } : { op: 'play', scheduled: true };
      expect(resolveTrigger(getItemDefinition(type)!, load(type), 'Load', IDLE_STATE), type).toEqual(expected);
    }
  });

  it('previews on the preview channel, except for volume and reset', () => {
    expect(commands(load('OPACITY'), 'preview', 3)).toEqual(['MIXER 3-10 OPACITY 0.5 12 EaseInQuad DEFER']);
    expect(commands(load('COMMIT'), 'preview', 3)).toEqual(['MIXER 3 COMMIT']);
    expect(commands(load('GRID'), 'preview', 3)).toEqual(['MIXER 3 GRID 2 12 EaseInQuad DEFER']);
    expect(commands(load('VOLUME'), 'preview', 3)).toEqual([]);
    expect(commands(load('RESET'), 'preview', 3)).toEqual([]);
    expect(resolveTrigger(getItemDefinition('RESET')!, load('RESET'), 'Preview', IDLE_STATE).op).toBeNull();
  });

  it('clears the cells of the grid layer by layer', () => {
    const grid = load('GRID');
    grid.props.grid = 3;
    expect(commands(grid, 'clearVideolayer')).toHaveLength(9);
    expect(commands(grid, 'clearVideolayer')[8]).toBe('MIXER 1-9 CLEAR');
  });

  it('plays on Next only when "trigger on next" is set', () => {
    for (const type of ['OPACITY', 'FILL', 'ANCHOR', 'PERSPECTIVE']) {
      const item = load(type);
      const definition = getItemDefinition(type)!;
      expect(resolveTrigger(definition, item, 'Play', IDLE_STATE), type).toEqual({ op: 'play', scheduled: true });
      expect(resolveTrigger(definition, item, 'Next', IDLE_STATE).op, type).toBeNull();
      item.props.triggeronnext = true;
      expect(resolveTrigger(definition, item, 'Play', IDLE_STATE).op, type).toBeNull();
      expect(resolveTrigger(definition, item, 'Next', IDLE_STATE).op, type).toBe('play');
    }
    expect(resolveTrigger(getItemDefinition('BRIGHTNESS')!, load('BRIGHTNESS'), 'Next', IDLE_STATE).op).toBeNull();
  });

  it('delays Update like Play and ignores a negative delay', () => {
    const item = load('OPACITY');
    expect(resolveTrigger(getItemDefinition('OPACITY')!, item, 'Update', IDLE_STATE)).toEqual({ op: 'play', scheduled: true });
    item.props.delay = -1;
    expect(resolveTrigger(getItemDefinition('OPACITY')!, item, 'Update', IDLE_STATE).op).toBeNull();
  });

  it('never stops a grid or reset after the duration', () => {
    expect(getItemDefinition('GRID')!.durationless).toBe(true);
    expect(getItemDefinition('RESET')!.durationless).toBe(true);
    expect(getItemDefinition('OPACITY')!.durationless).toBeUndefined();
  });

  it('defaults a new volume item to the audio layer', () => {
    expect(createItem('VOLUME').props.videolayer).toBe(30);
    expect(createItem('OPACITY').props.videolayer).toBe(10);
  });

  it('reads the legacy transtitionDuration, except for grid, and writes the correct key', () => {
    const legacy = (type: string) =>
      (parseRundown(qtXml(type, [['transtitionDuration', '7']])).items[0] as RundownItem).props.transitionDuration;
    expect(legacy('OPACITY')).toBe(7);
    expect(legacy('GRID')).toBe(0);
    const written = serializeRundown(parseRundown(qtXml('OPACITY', [['transtitionDuration', '7']])));
    expect(written).toContain('<transitionDuration>7</transitionDuration>');
    expect(written).not.toContain('transtition');
  });

  it('reads KEYER defer as 0/1 or true/false and writes 0/1', () => {
    const defer = (value: string) => (parseRundown(qtXml('KEYER', [['defer', value]])).items[0] as RundownItem).props.defer;
    expect([defer('1'), defer('0'), defer('true'), defer('false')]).toEqual([true, false, true, false]);
    expect(serializeRundown(parseRundown(qtXml('KEYER', [['defer', 'true']])))).toContain('<defer>1</defer>');
  });

  it('uses the Qt defaults for missing elements', () => {
    const rundown = parseRundown(
      '<items><item><type>CHROMAKEY</type><devicename></devicename><label></label><name></name></item></items>'
    );
    expect((rundown.items[0] as RundownItem).props).toMatchObject({
      key: 'None', spread: 0.44, spill: 1, threshold: 0.34, channel: 1, videolayer: 10, color: 'Transparent'
    });
  });
});
