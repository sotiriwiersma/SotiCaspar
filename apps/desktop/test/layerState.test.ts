import { describe, expect, it } from 'vitest';
import { applyLayerOsc, emptyLayer, holdsClip, mediaKey, serverState, stepSeek, type LayerSnapshot } from '../src/renderer/engine/layerState';

const NOW = 100_000;
const L = '/channel/1/stage/layer/999/';

/** A layer as CasparCG 2.5 reported it (values recorded from a real server, see the comments). */
function layer(report: Record<string, Array<string | number | boolean>>, now = NOW): LayerSnapshot {
  const snapshot = emptyLayer();
  for (const [path, args] of Object.entries(report)) applyLayerOsc(snapshot, { path: path.startsWith('/') ? path : L + path, args }, now);
  return snapshot;
}

const clip = { name: 'GRIDFSAED', media: true };
const playingAt = (time: number, extra: Record<string, Array<string | number | boolean>> = {}) =>
  layer({
    'foreground/producer': ['ffmpeg'],
    'foreground/file/name': ['GRIDFSAED'],
    'foreground/file/time': [time, 10],
    'foreground/file/clip': [0, 10],
    'foreground/paused': [false],
    'background/producer': ['empty'],
    ...extra
  });

describe('server state of an item', () => {
  it('LOAD: the clip is in the foreground, paused at its in point', () => {
    expect(serverState(playingAt(0, { 'foreground/paused': [true] }), clip, NOW)).toEqual({ loaded: true, playing: false, paused: false, ended: false });
  });

  it('PLAY: playing', () => {
    expect(serverState(playingAt(1.08), clip, NOW)).toEqual({ loaded: false, playing: true, paused: false, ended: false });
  });

  it('PAUSE in the middle: playing and paused, not loaded', () => {
    expect(serverState(playingAt(1.1, { 'foreground/paused': [true] }), clip, NOW)).toEqual({ loaded: false, playing: true, paused: true, ended: false });
  });

  it('LOAD with a SEEK: at the in point of the clip, not at the start of the file', () => {
    const seeked = playingAt(1, { 'foreground/paused': [true], 'foreground/file/clip': [1, 2] });
    expect(serverState(seeked, clip, NOW).loaded).toBe(true);
  });

  it('played to the end: not playing any more (the server keeps reporting it, unpaused)', () => {
    expect(serverState(playingAt(10), clip, NOW)).toEqual({ loaded: false, playing: false, paused: false, ended: true });
    // the end of a LENGTH counts too
    expect(serverState(playingAt(3, { 'foreground/file/clip': [1, 2] }), clip, NOW).ended).toBe(true);
    // a looping clip never ends
    expect(serverState(playingAt(10, { 'foreground/loop': [true] }), clip, NOW).playing).toBe(true);
  });

  it('LOADBG: loaded in the background, whatever plays in front', () => {
    const background = playingAt(1.2, { 'foreground/file/name': ['OTHER'], 'background/producer': ['transition'], 'background/file/name': ['GRIDFSAED'] });
    expect(serverState(background, clip, NOW)).toEqual({ loaded: true, playing: false, paused: false, ended: false });
  });

  it('another clip or producer on the layer: this item is idle', () => {
    expect(serverState(playingAt(1, { 'foreground/file/name': ['TEST1'] }), clip, NOW).playing).toBe(false);
    const colour = playingAt(1);
    applyLayerOsc(colour, { path: L + 'foreground/producer', args: ['color'] }, NOW);
    expect(serverState(colour, clip, NOW).playing).toBe(false);
  });

  it('STOP and CLEAR: idle (empty producer, or the layer is no longer reported)', () => {
    const stopped = playingAt(1);
    applyLayerOsc(stopped, { path: L + 'foreground/producer', args: ['empty'] }, NOW);
    expect(serverState(stopped, clip, NOW).playing).toBe(false);
    expect(serverState(playingAt(1), clip, NOW + 600).playing).toBe(false);
    expect(serverState(undefined, clip, NOW).playing).toBe(false);
  });

  it('items without a clip of their own only learn whether their layer is occupied and paused', () => {
    const template = { name: 'LOWER_THIRD', media: false };
    const html = layer({ 'foreground/producer': ['html'], 'foreground/paused': [true] });
    expect(serverState(html, template, NOW)).toEqual({ loaded: false, playing: true, paused: true, ended: false });
    expect(serverState(layer({ 'foreground/producer': ['empty'] }), template, NOW).playing).toBe(false);
  });

  it('recognises a clip whatever the case, extension or folder separator', () => {
    expect(mediaKey('clips\\Clip_001.mov')).toBe('CLIPS/CLIP_001');
    expect(mediaKey('CLIPS/CLIP_001')).toBe('CLIPS/CLIP_001');
    expect(serverState(playingAt(1, { 'foreground/file/name': ['gridfsaed'] }), clip, NOW).playing).toBe(true);
  });
});

describe('stepping a video', () => {
  // A 25 fps clip of 10 s on a 50 fps channel, paused at 4 s (channel frame 200), as the server reports it.
  const at = (time: number, clipFps: number | null = 25) =>
    layer({
      '/channel/1/framerate': [50, 1],
      'foreground/producer': ['ffmpeg'],
      'foreground/file/name': ['GRIDFSAED'],
      'foreground/file/time': [time, 10],
      'foreground/file/clip': [0, 10],
      'foreground/paused': [true],
      ...(clipFps === null ? {} : { 'foreground/file/streams/0/fps': [clipFps, 1] })
    });

  it('steps one picture of the clip: 2 channel frames for 25 fps on 50, 1 for 50 fps, 1 when unknown', () => {
    expect(stepSeek(at(4), 'frame', 1)).toEqual({ relative: 2 });
    expect(stepSeek(at(4), 'frame', -1)).toEqual({ relative: -2 });
    expect(stepSeek(at(4, 50), 'frame', 1)).toEqual({ relative: 1 });
    expect(stepSeek(at(4, null), 'frame', 1)).toEqual({ relative: 1 });
  });

  it('steps seconds and minutes in channel frames', () => {
    expect(stepSeek(at(4), 'second', 1)).toEqual({ relative: 50 });
    expect(stepSeek(at(4), 'second', -1)).toEqual({ relative: -50 });
  });

  it('goes to the first or last frame instead of past either end, and does nothing when already there', () => {
    expect(stepSeek(at(4), 'minute', -1)).toEqual({ absolute: 0 });
    expect(stepSeek(at(4), 'minute', 1)).toEqual({ absolute: 499 });
    expect(stepSeek(at(0), 'frame', -1)).toBeNull();
    expect(stepSeek(at(9.98), 'second', 1)).toBeNull();
  });

  it('needs a known position', () => {
    expect(stepSeek(emptyLayer(), 'frame', 1)).toBeNull();
  });

  it('only moves the clip of the selected row', () => {
    expect(holdsClip(at(4), 'GRIDFSAED', NOW)).toBe(true);
    expect(holdsClip(at(4), 'TEST1', NOW)).toBe(false);
    expect(holdsClip(at(4), 'GRIDFSAED', NOW + 600)).toBe(false);
  });
});
