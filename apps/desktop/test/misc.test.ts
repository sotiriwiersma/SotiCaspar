import { describe, expect, it } from 'vitest';
import { COMMANDS } from '../src/shared/commands';
import { countdownView } from '../src/renderer/engine/duration';
import { toMilliseconds } from '../src/renderer/engine/devices';
import {
  applyOsc,
  emptyFileState,
  layerPath,
  oscKind,
  oscView,
  toDecibel,
  type OscFileState,
  type OscViewOptions
} from '../src/renderer/engine/oscTime';
import { Scheduler } from '../src/renderer/engine/scheduler';
import { parseDeviceImport } from '../src/renderer/lib/importDevices';
import { commandForKey, shouldHandle } from '../src/renderer/lib/keymap';
import { fromMilliseconds, fromSeconds, libraryTimecode } from '../src/renderer/lib/timecode';
import { device, FakeClock } from './helpers';

describe('timecode', () => {
  it('formats positions like Timecode::fromTime', () => {
    expect(fromSeconds(3725.5, 25, false)).toBe('01:02:05:12');
    expect(fromSeconds(1.04, 25, true)).toBe('00:00:01.01');
  });

  it('formats countdowns with hundredths', () => {
    expect(fromMilliseconds(61_250, false)).toBe('00:01:01:25');
    expect(fromMilliseconds(-5, true)).toBe('00:00:00.00');
  });

  it('switches the library frame separator for drop frame notation', () => {
    expect(libraryTimecode('00:00:10:12', true)).toBe('00:00:10.12');
    expect(libraryTimecode('00:00:10:12', false)).toBe('00:00:10:12');
    expect(libraryTimecode('', true)).toBe('');
  });
});

describe('osc time', () => {
  const options: OscViewOptions = { itemName: 'FOLDER/CLIP', reverse: false, dropFrame: false, now: 1000 };

  const playing = (): OscFileState => {
    const state = emptyFileState();
    applyOsc(state, 'name', ['folder/clip.mp4'], 1000);
    applyOsc(state, 'fps', [25], 1000);
    applyOsc(state, 'clip', [0, 10], 1000);
    applyOsc(state, 'time', [2.5, 10], 1000);
    return state;
  };

  it('maps layer paths to values', () => {
    expect(oscKind(layerPath(1, 10, 'time'))).toBe('time');
    expect(oscKind('/channel/1/stage/layer/10/foreground/paused')).toBe('paused');
    expect(oscKind('/channel/1/framerate')).toBe('fps');
    expect(oscKind('/channel/1/something')).toBeNull();
  });

  it('reads the frame rate ratio sent by CasparCG 2.2+', () => {
    const state = emptyFileState();
    applyOsc(state, 'fps', [30000, 1001], 0);
    expect(state.fps).toBeCloseTo(29.97, 2);
    applyOsc(state, 'fps', [50, 1], 0);
    expect(state.fps).toBe(50);
  });

  it('shows time and progress of the item playing on the layer', () => {
    const view = oscView(playing(), options);
    expect(view).toMatchObject({ playing: true, time: '00:00:02:12', inTime: '00:00:00:00', outTime: '00:00:10:00', paused: false });
    expect(view.progress).toBeCloseTo(0.25);
  });

  it('counts down when reversed', () => {
    expect(oscView(playing(), { ...options, reverse: true }).time).toBe('00:00:07:12');
  });

  it('ignores another file on the layer and incomplete data', () => {
    const state = playing();
    expect(oscView(state, { ...options, itemName: 'OTHER' }).playing).toBe(false);
    expect(oscView(emptyFileState(), options).playing).toBe(false);
  });

  it('goes idle after silence unless paused', () => {
    const state = playing();
    expect(oscView(state, { ...options, now: 1499 }).playing).toBe(true);
    expect(oscView(state, { ...options, now: 1501 }).playing).toBe(false);
    applyOsc(state, 'paused', [true], 1000);
    expect(oscView(state, { ...options, now: 9000 })).toMatchObject({ playing: true, paused: true });
  });

  it('converts audio volume to decibel with a floor', () => {
    expect(toDecibel(2_147_483_647)).toBe(0);
    expect(toDecibel(Math.floor(2_147_483_647 / 10))).toBe(-20);
    expect(toDecibel(0)).toBe(-61);
  });
});

describe('duration countdown', () => {
  it('counts down and ends at zero', () => {
    expect(countdownView(10_000, 0, 2_500, false)).toMatchObject({ remaining: '00:00:07:50', total: '00:00:10:00', fraction: 0.75, running: true });
    expect(countdownView(10_000, 0, 10_001, false).running).toBe(false);
    expect(countdownView(0, 0, 0, false).running).toBe(false);
  });
});

describe('scheduler', () => {
  it('replaces pending steps of a key and runs due steps at once', () => {
    const clock = new FakeClock();
    const scheduler = new Scheduler(clock);
    const log: string[] = [];
    scheduler.schedule('k', [{ afterMs: 100, run: () => log.push('old') }]);
    scheduler.schedule('k', [{ afterMs: 0, run: () => log.push('now') }, { afterMs: 50, run: () => log.push('later') }]);
    expect(log).toEqual(['now']);
    clock.advance(200);
    expect(log).toEqual(['now', 'later']);
    scheduler.schedule('k', [{ afterMs: 10, run: () => log.push('x') }]);
    scheduler.cancelAll();
    clock.advance(100);
    expect(log).toEqual(['now', 'later']);
  });
});

describe('delay conversion', () => {
  it('uses the channel format fps in frame mode', () => {
    const d = device('A', { channelFormats: '1080p5000,PAL,1080p5994' });
    expect(toMilliseconds(500, 'Milliseconds', d, 1)).toBe(500);
    expect(toMilliseconds(50, 'Frames', d, 1)).toBe(1000);
    expect(toMilliseconds(25, 'Frames', d, 2)).toBe(1000);
    expect(toMilliseconds(1, 'Frames', d, 4)).toBeNull();
    expect(toMilliseconds(25, 'Frames', undefined, 1)).toBe(1000);
  });
});

describe('keymap', () => {
  const key = (k: string, mods: Partial<KeyboardEvent> = {}) => ({ key: k, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...mods });

  it('maps the Qt shortcuts', () => {
    expect(commandForKey(key('F2'))).toBe('playout.play');
    expect(commandForKey(key('F2', { shiftKey: true }))).toBe('playout.playNow');
    expect(commandForKey(key('F12'))).toBe('playout.clearChannel');
    expect(commandForKey(key('s', { ctrlKey: true }))).toBe('file.save');
    expect(commandForKey(key('S', { ctrlKey: true, shiftKey: true }))).toBe('file.saveAs');
    expect(commandForKey(key('C', { shiftKey: true }))).toBe('rundown.copyProps');
    expect(commandForKey(key('x'))).toBeNull();
  });

  it('has an accelerator for every playout command of the Qt menu', () => {
    for (const id of Object.keys(COMMANDS).filter((c) => c.startsWith('playout.'))) {
      expect(COMMANDS[id as keyof typeof COMMANDS].accelerator).toBeDefined();
    }
  });

  it('does not steal typing: letter shortcuts are ignored in text fields', () => {
    const input = { tagName: 'INPUT', isContentEditable: false } as unknown as EventTarget;
    expect(shouldHandle('rundown.copyProps', input)).toBe(false);
    expect(shouldHandle('playout.play', input)).toBe(true);
    expect(shouldHandle('file.save', input)).toBe(true);
  });
});

describe('device import', () => {
  it('reads the server list exported by the Qt client', () => {
    const xml = `<servers>
      <device><name>Main</name><address>10.0.0.5</address><port>5251</port><shadow>No</shadow><previewchannel>3</previewchannel><lockedchannel>0</lockedchannel></device>
      <device><name>Backup</name><address>10.0.0.6</address><shadow>Yes</shadow><description>mirror</description></device>
    </servers>`;
    const devices = parseDeviceImport(xml);
    expect(devices).toHaveLength(2);
    expect(devices[0]).toMatchObject({ name: 'Main', address: '10.0.0.5', port: 5251, shadow: false, previewChannel: 3 });
    expect(devices[1]).toMatchObject({ name: 'Backup', port: 5250, shadow: true, description: 'mirror' });
    expect(() => parseDeviceImport('<other/>')).toThrow();
  });
});

describe('error text', () => {
  it('drops the wrapping Electron adds to errors from the main process', async () => {
    const { errorText } = await import('../src/renderer/engine/engine');
    expect(errorText(new Error("Error invoking remote method 'backend:sendCompanion': Error: Companion: Page not found"))).toBe('Companion: Page not found');
    expect(errorText(new Error('Cannot reach Companion at 127.0.0.1:16759: connect ECONNREFUSED'))).toBe('Cannot reach Companion at 127.0.0.1:16759: connect ECONNREFUSED');
    expect(errorText('plain')).toBe('plain');
  });
});
