import { IDLE_STATE, type ItemState, type OscMessage } from '@soticaspar/core';
import { applyOsc, emptyFileState, oscKind, STALE_MS, type OscFileState } from './oscTime';

/**
 * What the server reports over OSC for one layer (CasparCG 2.2+, checked against 2.5):
 *
 * - `foreground/producer` is `ffmpeg`, `color`, `html`, `route`, ... and `empty` after STOP.
 * - `foreground/file/name` is the clip's name without extension; `file/time` is the position in the file and its
 *   duration; `file/clip` is the in point and the length of what plays (SEEK / LENGTH), all in seconds.
 * - LOAD puts the clip in the foreground, paused at its in point. LOADBG puts it in the background
 *   (`background/file/name`), where a bare PLAY takes it.
 * - A clip that reached its end keeps being reported at `time = duration` with `paused` false.
 * - A cleared layer is no longer reported at all.
 */
export interface LayerSnapshot extends OscFileState {
  producer: string;
  backgroundProducer: string;
  backgroundName: string;
  /** Frame rate of the clip itself (`file/streams/0/fps`), 0 when unknown. The channel's is `fps`. */
  clipFps: number;
  /** Clock time of the last message for the layer. */
  seen: number;
}

export const emptyLayer = (): LayerSnapshot => ({ ...emptyFileState(), producer: '', backgroundProducer: '', backgroundName: '', clipFps: 0, seen: 0 });

/** Layer paths below `/channel/N/stage/layer/L/` besides those of `oscTime`. */
export const EXTRA_LAYER_PATHS = {
  producer: 'foreground/producer',
  backgroundProducer: 'background/producer',
  backgroundName: 'background/file/name',
  clipFps: 'foreground/file/streams/0/fps'
} as const;

export function applyLayerOsc(layer: LayerSnapshot, message: OscMessage, now: number): boolean {
  const { path, args } = message;
  if (path.endsWith('/foreground/file/streams/0/fps')) {
    const numerator = Number(args[0]) || 0;
    const denominator = Number(args[1]) || 0;
    layer.clipFps = denominator > 0 ? numerator / denominator : numerator;
  } else if (path.endsWith('/background/file/name')) layer.backgroundName = String(args[0] ?? '');
  else if (path.endsWith('/background/producer')) {
    layer.backgroundProducer = String(args[0] ?? '');
    if (layer.backgroundProducer === 'empty') layer.backgroundName = '';
  } else if (path.endsWith('/foreground/producer')) {
    layer.producer = String(args[0] ?? '');
    // Another producer (a colour, a route, nothing) took the layer: the file values no longer apply.
    if (layer.producer !== 'ffmpeg') Object.assign(layer, { name: '', time: 0, totalTime: 0, clip: 0, totalClip: 0, clipFps: 0 });
  } else {
    const kind = oscKind(path);
    if (!kind) return false;
    applyOsc(layer, kind, args, now);
  }
  if (!path.endsWith('/framerate')) layer.seen = now;
  return true;
}

/** Clip names as the server reports them: no extension, any case, `/` between folders. */
export const mediaKey = (name: string): string => name.replace(/\\/g, '/').replace(/\.[^./]*$/, '').toUpperCase();

/** One frame of tolerance (at up to 60 fps) for "at the in point" and "at the end". */
const FRAME = 1 / 60 + 0.001;

export interface ServerState extends ItemState {
  /** The clip played to its end and stands on its last frame. */
  ended: boolean;
}

export const IDLE_SERVER_STATE: Readonly<ServerState> = { ...IDLE_STATE, ended: false };

/**
 * The playout state of an item, from what its layer reports.
 *
 * Items with media of their own (a clip) are recognised by name: the layer must hold that clip. Other items
 * (templates, colours, routes, inputs) cannot be told apart on the server, so they only learn whether their layer is
 * occupied and paused, which is what pause and resume need. They are never "loaded".
 */
export function serverState(layer: LayerSnapshot | undefined, item: { name: string; media: boolean }, now: number): ServerState {
  if (!layer || now - layer.seen >= STALE_MS || layer.producer === '' || layer.producer === 'empty') {
    return item.media && layer && now - layer.seen < STALE_MS && mediaKey(layer.backgroundName) === mediaKey(item.name) && item.name !== ''
      ? { ...IDLE_SERVER_STATE, loaded: true }
      : IDLE_SERVER_STATE;
  }

  if (!item.media) return { loaded: false, playing: true, paused: layer.paused, ended: false };

  const key = mediaKey(item.name);
  if (key !== '' && layer.name !== '' && mediaKey(layer.name) === key) {
    const end = layer.totalClip > 0 ? Math.min(layer.totalTime || Infinity, layer.clip + layer.totalClip) : layer.totalTime;
    const ended = !layer.loop && end > 0 && layer.time >= end - FRAME;
    if (layer.paused && Math.abs(layer.time - layer.clip) <= FRAME) return { loaded: true, playing: false, paused: false, ended: false };
    if (ended) return { ...IDLE_SERVER_STATE, ended: true };
    return { loaded: false, playing: true, paused: layer.paused, ended: false };
  }
  if (key !== '' && mediaKey(layer.backgroundName) === key) return { ...IDLE_SERVER_STATE, loaded: true };
  return IDLE_SERVER_STATE;
}

/** The layer shows `name` in its foreground (playing, paused or loaded there). */
export function holdsClip(layer: LayerSnapshot | undefined, name: string, now: number): boolean {
  return !!layer && now - layer.seen < STALE_MS && layer.producer === 'ffmpeg' && name !== '' && mediaKey(layer.name) === mediaKey(name);
}

export type StepUnit = 'frame' | 'second' | 'minute';

/**
 * The SEEK for a step of one frame, second or minute (`direction` 1 or -1). SEEK counts frames of the channel; a
 * frame step is one picture of the clip, so 2 channel frames for a 25 fps clip on a 50 fps channel. Inside the file
 * the server moves relative to where it is (`rel`, exact even while playing); a step past either end goes to the first
 * or last frame instead. `null` when there is nothing to do (already at that end, or no position known).
 */
export function stepSeek(layer: LayerSnapshot, unit: StepUnit, direction: 1 | -1): { relative: number } | { absolute: number } | null {
  const channel = layer.fps;
  if (!(channel > 0) || !(layer.totalTime > 0)) return null;
  const perPicture = layer.clipFps > 0 ? Math.max(1, Math.round(channel / layer.clipFps)) : 1;
  const amount = unit === 'frame' ? perPicture : Math.round(channel * (unit === 'second' ? 1 : 60));
  const delta = direction * amount;
  const current = Math.round(layer.time * channel);
  const last = Math.max(0, Math.round(layer.totalTime * channel) - 1);
  const target = current + delta;
  if (target < 0) return current <= 0 ? null : { absolute: 0 };
  if (target > last) return current >= last ? null : { absolute: last };
  return { relative: delta };
}
