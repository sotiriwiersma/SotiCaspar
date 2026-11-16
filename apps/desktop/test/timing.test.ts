import { describe, expect, it } from 'vitest';
import { createItem, framesPerSecond } from '@soticaspar/core';
import { toMilliseconds } from '../src/renderer/engine/devices';
import { IDLE_NOW, decodeLayer, encodeLayer, layerLabel, nowTexts, nowView, parseLayerInput, seekFrame } from '../src/renderer/engine/nowPlaying';
import { emptyFileState } from '../src/renderer/engine/oscTime';
import { applyItemDefaults } from '../src/renderer/lib/definitions';
import { framesToTimecode, timecodeToFrames } from '../src/renderer/lib/timecode';
import { device, fill, harness, movie } from './helpers';

const NTSC = 30000 / 1001;
const NTSC60 = 60000 / 1001;
const FILM = 24000 / 1001;

describe('frame rates', () => {
  it('uses the exact NTSC rates, not the rounded ones', () => {
    expect(framesPerSecond('1080p2398')).toBeCloseTo(FILM, 10);
    expect(framesPerSecond('1080p2997')).toBeCloseTo(NTSC, 10);
    expect(framesPerSecond('1080p5994')).toBeCloseTo(NTSC60, 10);
  });

  it('counts an interlaced 59.94 format as 29.97 frames per second', () => {
    expect(framesPerSecond('1080i5994')).toBeCloseTo(NTSC, 10);
    expect(framesPerSecond('1080i5000')).toBe(25);
    expect(framesPerSecond('1080i6000')).toBe(30);
  });

  it('converts a frame count to the right number of milliseconds', () => {
    const d = device('A', { channelFormats: '1080p2398,1080p2997,1080p5994,1080p5000' });
    // 1001 ms is exactly 24 frames at 23.976, 30 at 29.97 and 60 at 59.94
    expect(toMilliseconds(24, 'Frames', d, 1)).toBe(1001);
    expect(toMilliseconds(30, 'Frames', d, 2)).toBe(1001);
    expect(toMilliseconds(60, 'Frames', d, 3)).toBe(1001);
    expect(toMilliseconds(50, 'Frames', d, 4)).toBe(1000);
    // 108000 frames at 30000/1001 fps is 3603.6 s (non drop frame timecode runs 3.6 s per hour behind the clock) ...
    expect(toMilliseconds(108_000, 'Frames', d, 2)).toBe(3_603_600);
    // ... which drop frame fixes by skipping 108 frame numbers an hour: 107892 frames land within 4 ms of the hour
    expect(toMilliseconds(107_892, 'Frames', d, 2)).toBe(3_599_996);
  });

  it('treats the timecode setting like frames', () => {
    const d = device('A', { channelFormats: '1080p5000' });
    expect(toMilliseconds(50, 'Timecode', d, 1)).toBe(1000);
    expect(toMilliseconds(1, 'Timecode', d, 2)).toBeNull();
  });
});

describe('frames <-> timecode', () => {
  it('writes whole seconds, minutes and hours', () => {
    expect(framesToTimecode(0, 25)).toBe('00:00:00:00');
    expect(framesToTimecode(24, 25)).toBe('00:00:00:24');
    expect(framesToTimecode(25, 25)).toBe('00:00:01:00');
    expect(framesToTimecode(25 * 3600, 25)).toBe('01:00:00:00');
    expect(framesToTimecode(25 * 3600 + 25 * 61 + 7, 25)).toBe('01:01:01:07');
    expect(framesToTimecode(50 * 90, 50)).toBe('00:01:30:00');
    expect(framesToTimecode(25 * 3600 * 30, 25)).toBe('30:00:00:00'); // hours do not wrap
  });

  it('counts at the nominal rate of the NTSC family', () => {
    expect(framesToTimecode(30, NTSC)).toBe('00:00:01:00');
    expect(framesToTimecode(24, FILM)).toBe('00:00:01:00');
    expect(framesToTimecode(60, NTSC60)).toBe('00:00:01:00');
    expect(framesToTimecode(107_892, NTSC)).toBe('00:59:56:12'); // non drop frame runs behind the clock
  });

  it('skips the dropped frame numbers in drop frame', () => {
    expect(framesToTimecode(1799, NTSC, true)).toBe('00:00:59.29');
    expect(framesToTimecode(1800, NTSC, true)).toBe('00:01:00.02');
    expect(framesToTimecode(17_981, NTSC, true)).toBe('00:09:59.29');
    expect(framesToTimecode(17_982, NTSC, true)).toBe('00:10:00.00');
    expect(framesToTimecode(107_892, NTSC, true)).toBe('01:00:00.00'); // 108000 minus 108 dropped numbers
    expect(framesToTimecode(3599, NTSC60, true)).toBe('00:00:59.59');
    expect(framesToTimecode(3600, NTSC60, true)).toBe('00:01:00.04');
    expect(framesToTimecode(215_784, NTSC60, true)).toBe('01:00:00.00');
  });

  it('does not use drop frame for other rates', () => {
    expect(framesToTimecode(1800, 30, true)).toBe('00:01:00:00');
    expect(framesToTimecode(1500, 25, true)).toBe('00:01:00:00');
    expect(framesToTimecode(1440, FILM, true)).toBe('00:01:00:00');
  });

  it('keeps the sign of a negative count', () => {
    expect(framesToTimecode(-1, 25)).toBe('-00:00:00:01');
    expect(timecodeToFrames('-00:00:00:01', 25)).toBe(-1);
  });

  it('reads what the user types', () => {
    expect(timecodeToFrames('00:00:01:00', 25)).toBe(25);
    expect(timecodeToFrames('1:05', 25)).toBe(30); // ss:ff
    expect(timecodeToFrames('12', 25)).toBe(12); // a plain number is frames
    expect(timecodeToFrames(' 00.00.02.10 ', 25)).toBe(60);
    expect(timecodeToFrames('00:00:00:50', 25)).toBe(50); // fields may overflow
    expect(timecodeToFrames('00:01:00;02', NTSC, true)).toBe(1800);
  });

  it('rejects anything else', () => {
    for (const text of ['', 'abc', '1:2:3:4:5', '00:00:xx:00', '1,5', '--1', '00::00']) expect(timecodeToFrames(text, 25)).toBeNull();
  });

  it('round trips every frame count, with and without drop frame', () => {
    const rates = [FILM, 24, 25, NTSC, 30, 50, NTSC60, 60];
    for (const fps of rates) {
      for (const drop of [false, true]) {
        const counts = [0, 1, 2, 3, 29, 30, 59, 60, 1798, 1799, 1800, 1801, 3596, 3597, 3598, 3599, 3600, 3601, 17_981, 17_982, 17_983, 35_963, 35_964, 107_891, 107_892, 107_893, 215_784];
        for (let n = 0; n < 400_000; n += 997) counts.push(n);
        for (const n of counts) {
          const text = framesToTimecode(n, fps, drop);
          expect(timecodeToFrames(text, fps, drop), `${n} frames at ${fps} (drop ${drop}) -> ${text}`).toBe(n);
        }
      }
    }
  });

  it('advances by exactly one frame, in order, over a whole drop frame hour boundary', () => {
    let previous = '';
    for (let n = 0; n <= 20_000; n++) {
      const text = framesToTimecode(n, NTSC, true);
      expect(text > previous).toBe(true);
      previous = text;
    }
  });
});

describe('countdown bar', () => {
  const NOW = 10_000;
  const playing = (overrides: Partial<ReturnType<typeof emptyFileState>> = {}) => ({
    ...emptyFileState(),
    name: 'CLIP',
    fps: 25,
    time: 12,
    totalTime: 60,
    clip: 0,
    totalClip: 60,
    lastSeen: NOW - 20,
    ...overrides
  });

  it('shows played, remaining and total of the whole file', () => {
    const view = nowView(playing(), { ignoreInOut: false, now: NOW });
    expect(view).toMatchObject({ active: true, start: 0, length: 60, played: 12, remaining: 48, fraction: 0.2 });
    expect(nowTexts(view, false)).toEqual({ played: '00:00:12:00', remaining: '00:00:48:00', total: '00:01:00:00' });
  });

  it('counts from the IN point to the OUT point', () => {
    // SEEK 10 s, LENGTH 30 s, now at 15 s in the file
    const state = playing({ time: 15, clip: 10, totalClip: 30 });
    const view = nowView(state, { ignoreInOut: false, now: NOW });
    expect(view).toMatchObject({ start: 10, length: 30, played: 5, remaining: 25 });
    expect(nowTexts(view, false)).toEqual({ played: '00:00:05:00', remaining: '00:00:25:00', total: '00:00:30:00' });
  });

  it('shows the whole file when in and out points are ignored', () => {
    const state = playing({ time: 15, clip: 10, totalClip: 30 });
    expect(nowView(state, { ignoreInOut: true, now: NOW })).toMatchObject({ start: 0, length: 60, played: 15, remaining: 45 });
  });

  it('is clamped to the clip', () => {
    expect(nowView(playing({ time: 3, clip: 10, totalClip: 30 }), { ignoreInOut: false, now: NOW }).played).toBe(0);
    expect(nowView(playing({ time: 99, clip: 10, totalClip: 30 }), { ignoreInOut: false, now: NOW })).toMatchObject({ played: 30, remaining: 0, fraction: 1 });
    // a length that runs past the end of the file stops at the end
    expect(nowView(playing({ time: 50, clip: 50, totalClip: 30 }), { ignoreInOut: false, now: NOW })).toMatchObject({ start: 50, length: 10 });
  });

  it('is idle without fresh messages, unless paused', () => {
    expect(nowView(playing({ lastSeen: NOW - 5000 }), { ignoreInOut: false, now: NOW })).toBe(IDLE_NOW);
    expect(nowView(playing({ lastSeen: NOW - 5000, paused: true }), { ignoreInOut: false, now: NOW }).active).toBe(true);
    expect(nowView(emptyFileState(), { ignoreInOut: false, now: NOW })).toBe(IDLE_NOW);
  });

  it('played and remaining always add up to the total, at fractional frame rates too', () => {
    for (const fps of [NTSC, FILM, NTSC60, 25]) {
      for (const drop of [false, true]) {
        for (let t = 0; t <= 10; t += 0.137) {
          const view = nowView(playing({ fps, time: t, totalTime: 10, totalClip: 10 }), { ignoreInOut: false, now: NOW });
          const texts = nowTexts(view, drop);
          const total = Math.round(10 * fps);
          const played = Math.min(total, Math.round(t * fps));
          expect(timecodeToFrames(texts.played, fps, drop)).toBe(played);
          expect(timecodeToFrames(texts.remaining, fps, drop)).toBe(total - played);
          expect(timecodeToFrames(texts.total, fps, drop)).toBe(total);
        }
      }
    }
  });

  it('seeks in file frames, counted from the start of the file', () => {
    const view = nowView(playing({ time: 15, clip: 10, totalClip: 30 }), { ignoreInOut: false, now: NOW });
    expect(seekFrame(view, 0)).toBe(250); // the IN point
    expect(seekFrame(view, 0.5)).toBe(625);
    expect(seekFrame(view, 1)).toBe(1000); // the OUT point
    expect(seekFrame(view, 7)).toBe(1000);
    expect(seekFrame(view, -1)).toBe(250);
    const whole = nowView(playing({ time: 15, clip: 10, totalClip: 30 }), { ignoreInOut: true, now: NOW });
    expect(seekFrame(whole, 0.5)).toBe(750);
  });
});

describe('default properties of new clips', () => {
  const none = { useFreezeOnLoad: false, clipDefaults: {} };

  it('leaves an item alone without defaults', () => {
    const item = createItem('MOVIE', { name: 'A' });
    expect(applyItemDefaults(item, none)).toBe(item);
  });

  it('applies the defaults of the clip type only', () => {
    const settings = { ...none, clipDefaults: { MOVIE: { loop: true, channel: 2, videolayer: 5 } } };
    expect(applyItemDefaults(createItem('MOVIE', { name: 'A' }), settings).props).toMatchObject({ loop: true, channel: 2, videolayer: 5 });
    expect(applyItemDefaults(createItem('STILL', { name: 'A' }), settings).props).not.toMatchObject({ channel: 2 });
  });

  it('keeps the duration of the media', () => {
    const settings = { ...none, clipDefaults: { MOVIE: { timecode: '99:99:99:99', loop: true } } };
    const item = createItem('MOVIE', { name: 'A', props: { timecode: '00:00:10:00' } });
    expect(applyItemDefaults(item, settings).props).toMatchObject({ timecode: '00:00:10:00', loop: true });
  });

  it('lets a clip default override Use freeze on load', () => {
    const item = createItem('MOVIE', { name: 'A' });
    expect(applyItemDefaults(item, { useFreezeOnLoad: true, clipDefaults: {} }).props.freezeonload).toBe(true);
    expect(applyItemDefaults(item, { useFreezeOnLoad: true, clipDefaults: { MOVIE: { freezeonload: false } } }).props.freezeonload).toBe(false);
  });
});

describe('row flash', () => {
  const flashOf = (h: ReturnType<typeof harness>, id: string) => {
    const { flash, flashKind, flashAt } = h.engine.runtime(id);
    return { flash, flashKind, flashAt };
  };

  it('is green for play, red for stop and clear, blue for everything else', () => {
    const h = harness();
    const [clip] = fill(h, [movie('CLIP')]);
    h.model.select(clip.id, 'single');

    h.clock.advance(100);
    h.engine.trigger('Play');
    expect(flashOf(h, clip.id)).toEqual({ flash: 1, flashKind: 'play', flashAt: 100 });
    h.clock.advance(100);
    h.engine.trigger('Stop');
    expect(flashOf(h, clip.id)).toEqual({ flash: 2, flashKind: 'stop', flashAt: 200 });

    for (const [type, kind] of [
      ['PlayNow', 'play'],
      ['Clear', 'stop'],
      ['ClearVideoLayer', 'stop'],
      ['ClearChannel', 'stop'],
      ['Load', 'other'],
      ['PauseResume', 'other'],
      ['Update', 'other'],
      ['Invoke', 'other'],
      ['Preview', 'other']
    ] as const) {
      h.engine.trigger(type);
      expect(h.engine.runtime(clip.id).flashKind, type).toBe(kind);
    }
  });

  it('does not change when an item is only selected or moved', () => {
    const h = harness();
    const [a, b] = fill(h, [movie('A'), movie('B')]);
    h.model.select(a.id, 'single');
    h.engine.trigger('Play');
    const before = flashOf(h, a.id);
    h.model.select(b.id, 'single');
    h.model.select(a.id, 'single');
    expect(flashOf(h, a.id)).toEqual(before);
    expect(flashOf(h, b.id).flash).toBe(0);
  });
});

describe('countdown layer choice', () => {
  const devices = ['Localhost', 'Studio A'];

  it('reads channel-layer, with an optional server in front', () => {
    expect(parseLayerInput('1-10', devices)).toEqual({ deviceName: 'Localhost', channel: 1, layer: 10 });
    expect(parseLayerInput(' 2 - 20 ', devices)).toEqual({ deviceName: 'Localhost', channel: 2, layer: 20 });
    expect(parseLayerInput('Studio A 3-0', devices)).toEqual({ deviceName: 'Studio A', channel: 3, layer: 0 });
    expect(parseLayerInput('studio a 3-5', devices)).toEqual({ deviceName: 'Studio A', channel: 3, layer: 5 });
  });

  it('explains what is wrong', () => {
    expect(parseLayerInput('10', devices)).toMatch(/channel-layer/);
    expect(parseLayerInput('Nowhere 1-10', devices)).toMatch(/no server called "Nowhere"/);
    expect(parseLayerInput('0-10', devices)).toMatch(/start at 1/);
    expect(parseLayerInput('1-10', [])).toMatch(/no server/);
  });

  it('stores a layer in the settings and reads it back', () => {
    const target = { deviceName: 'Studio A', channel: 2, layer: 20 };
    expect(decodeLayer(encodeLayer(target))).toEqual(target);
    for (const bad of ['', 'A', 'A|0|1', 'A|1|-1', 'A|x|1', 'A|1|2|3']) expect(decodeLayer(bad), bad).toBeNull();
    expect(layerLabel(target, true)).toBe('Studio A 2-20');
    expect(layerLabel(target, false)).toBe('2-20');
  });
});
