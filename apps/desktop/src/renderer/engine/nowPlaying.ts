import { framesToTimecode } from '../lib/timecode';
import { STALE_MS, type OscFileState } from './oscTime';

/** What the countdown bar shows for the video that is playing. All times are in seconds. */
export interface NowView {
  /** The server reports playback of the item (a fresh `time` message, or a paused layer). */
  active: boolean;
  name: string;
  paused: boolean;
  loop: boolean;
  fps: number;
  /** Where the bar's left end is in the file: the IN point, or 0 when in and out points are ignored. */
  start: number;
  /** Length between the left and right end of the bar. */
  length: number;
  played: number;
  remaining: number;
  /** 0..1 */
  fraction: number;
}

export const IDLE_NOW: Readonly<NowView> = {
  active: false, name: '', paused: false, loop: false, fps: 0, start: 0, length: 0, played: 0, remaining: 0, fraction: 0
};

export interface NowOptions {
  /** `Disable in and out points in video progress`: show the whole file instead of the part that is played. */
  ignoreInOut: boolean;
  now: number;
}

/**
 * Position of the playing video from the OSC state of its layer.
 *
 * `file/time` is the position in the file and its duration, `file/clip` the start and the length of the part
 * that plays (the SEEK and LENGTH of the item). Played time counts from the left end of the bar, so a clip that
 * starts at its IN point shows `00:00:00:00` there, and the remaining time is what is left up to the OUT point.
 */
export function nowView(state: OscFileState, options: NowOptions): NowView {
  const fresh = state.paused || options.now - state.lastSeen < STALE_MS;
  if (!(state.totalTime > 0 && state.fps > 0 && state.name !== '' && fresh)) return IDLE_NOW;

  const start = options.ignoreInOut ? 0 : Math.min(state.clip, state.totalTime);
  const end = options.ignoreInOut || state.totalClip <= 0 ? state.totalTime : Math.min(state.totalTime, state.clip + state.totalClip);
  const length = Math.max(0, end - start);
  const played = Math.min(length, Math.max(0, state.time - start));
  return {
    active: true,
    name: state.name,
    paused: state.paused,
    loop: state.loop,
    fps: state.fps,
    start,
    length,
    played,
    remaining: length - played,
    fraction: length > 0 ? played / length : 0
  };
}

/** The three timecodes of the bar, derived from frame counts so that played + remaining equals the total. */
export function nowTexts(view: NowView, dropFrame: boolean): { played: string; remaining: string; total: string } {
  if (!view.active) {
    const zero = framesToTimecode(0, view.fps || 25, dropFrame);
    return { played: zero, remaining: zero, total: zero };
  }
  const total = Math.round(view.length * view.fps);
  const played = Math.min(total, Math.round(view.played * view.fps));
  return {
    played: framesToTimecode(played, view.fps, dropFrame),
    remaining: framesToTimecode(total - played, view.fps, dropFrame),
    total: framesToTimecode(total, view.fps, dropFrame)
  };
}

/**
 * The AMCP `SEEK` frame for a position `fraction` along the bar: counted from the start of the file, in frames of
 * the channel (`view.fps` is the channel's frame rate, as the server counts SEEK).
 */
export function seekFrame(view: NowView, fraction: number): number {
  const clamped = Math.min(1, Math.max(0, fraction));
  return Math.round((view.start + clamped * view.length) * view.fps);
}

// ---------------------------------------------------------------- the layer the bar follows

/** A layer of a server. */
export interface LayerTarget {
  deviceName: string;
  channel: number;
  layer: number;
}

/** `device|channel|layer` (the `countdownLayer` setting) and back. */
export const encodeLayer = (target: LayerTarget): string => `${target.deviceName}|${target.channel}|${target.layer}`;

export function decodeLayer(text: string): LayerTarget | null {
  const [deviceName, channel, layer, ...rest] = text.split('|');
  const c = Number(channel);
  const l = Number(layer);
  return deviceName && rest.length === 0 && Number.isInteger(c) && c > 0 && Number.isInteger(l) && l >= 0 ? { deviceName, channel: c, layer: l } : null;
}

/** `1-10`, or `Server 1-10` when there is more than one server, as the user writes it. */
export const layerLabel = (target: LayerTarget, withDevice: boolean): string =>
  `${withDevice ? `${target.deviceName} ` : ''}${target.channel}-${target.layer}`;

/**
 * Reads `channel-layer` with an optional server name in front (`1-10`, `Studio A 2-20`). Without a name the
 * first server is meant. Returns an explanation instead when the text does not name an existing layer.
 */
export function parseLayerInput(text: string, deviceNames: readonly string[]): LayerTarget | string {
  const match = /^\s*(?:(.*?)\s+)?(\d+)\s*-\s*(\d+)\s*$/.exec(text);
  if (!match) return 'Write it as channel-layer, for example 1-10';
  const name = match[1]?.trim() ?? '';
  const deviceName = name === '' ? deviceNames[0] : deviceNames.find((d) => d.toLowerCase() === name.toLowerCase());
  if (!deviceName) return name === '' ? 'There is no server yet' : `There is no server called "${name}"`;
  const channel = Number(match[2]);
  const layer = Number(match[3]);
  if (channel < 1) return 'Channels start at 1';
  return { deviceName, channel, layer };
}
