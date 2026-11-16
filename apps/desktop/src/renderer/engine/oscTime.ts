import type { OscMessage } from '@soticaspar/core';
import { fromSeconds } from '../lib/timecode';

export type OscKind = 'time' | 'clip' | 'name' | 'paused' | 'loop' | 'fps';

/** Layer paths below `/channel/N/stage/layer/L/foreground` that the row progress needs (Global.h `VIDEOLAYER_*_FILTER`). */
export const LAYER_PATHS: Readonly<Record<Exclude<OscKind, 'fps'>, string>> = {
  time: 'foreground/file/time',
  clip: 'foreground/file/clip',
  name: 'foreground/file/name',
  paused: 'foreground/paused',
  loop: 'foreground/loop'
};

export const layerPath = (channel: number, layer: number, kind: Exclude<OscKind, 'fps'>): string =>
  `/channel/${channel}/stage/layer/${layer}/${LAYER_PATHS[kind]}`;
export const fpsPath = (channel: number): string => `/channel/${channel}/framerate`;
export const audioVolumePath = (channel: number): string => `/channel/${channel}/mixer/audio/volume`;

export function oscKind(path: string): OscKind | null {
  if (path.endsWith('/foreground/file/time')) return 'time';
  if (path.endsWith('/foreground/file/clip')) return 'clip';
  if (path.endsWith('/foreground/file/name')) return 'name';
  if (path.endsWith('/foreground/paused')) return 'paused';
  if (path.endsWith('/foreground/loop')) return 'loop';
  if (path.endsWith('/framerate')) return 'fps';
  return null;
}

export interface OscFileState {
  time: number;
  totalTime: number;
  clip: number;
  totalClip: number;
  fps: number;
  name: string;
  paused: boolean;
  loop: boolean;
  /** Clock time of the last `time` message. */
  lastSeen: number;
}

export const emptyFileState = (): OscFileState => ({
  time: 0, totalTime: 0, clip: 0, totalClip: 0, fps: 0, name: '', paused: false, loop: false, lastSeen: 0
});

const num = (value: OscMessage['args'][number] | undefined): number => {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
};

export function applyOsc(state: OscFileState, kind: OscKind, args: OscMessage['args'], now: number): void {
  switch (kind) {
    case 'time':
      state.time = num(args[0]);
      state.totalTime = num(args[1]);
      state.lastSeen = now;
      break;
    case 'clip':
      state.clip = num(args[0]);
      state.totalClip = num(args[1]);
      break;
    case 'fps': {
      // CasparCG 2.2+ sends the frame rate as a ratio (`50 1`, `30000 1001`); Qt only read the first value.
      const denominator = num(args[1]);
      state.fps = denominator > 0 ? num(args[0]) / denominator : num(args[0]);
      break;
    }
    case 'name':
      state.name = String(args[0] ?? '');
      break;
    case 'paused':
      state.paused = args[0] === true || args[0] === 1 || args[0] === 'true';
      break;
    case 'loop':
      state.loop = args[0] === true || args[0] === 1 || args[0] === 'true';
      break;
  }
}

export interface OscTimeView {
  /** Playback is reported for this item, progress and time are meaningful. */
  playing: boolean;
  time: string;
  inTime: string;
  outTime: string;
  /** 0..1 */
  progress: number;
  paused: boolean;
  loop: boolean;
}

export interface OscViewOptions {
  itemName: string;
  reverse: boolean;
  dropFrame: boolean;
  now: number;
}

/** Silence after which a layer counts as no longer playing (OscTimeWidget::checkState). */
export const STALE_MS = 500;

export const IDLE_VIEW: Readonly<OscTimeView> = { playing: false, time: '', inTime: '', outTime: '', progress: 0, paused: false, loop: false };

const withoutExtension = (name: string): string => {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? name : name.slice(0, dot);
};

/** Port of RundownMovieWidget::updateOscWidget and OscTimeWidget. */
export function oscView(state: OscFileState, options: OscViewOptions): OscTimeView {
  const sameFile = withoutExtension(state.name).toLowerCase() === options.itemName.toLowerCase();
  const fresh = state.paused || options.now - state.lastSeen < STALE_MS;
  if (!(state.time > 0 && state.totalTime > 0 && state.fps > 0 && state.name !== '' && sameFile && fresh)) return IDLE_VIEW;

  const elapsed = state.time - state.clip;
  const shown = options.reverse ? state.totalTime - elapsed : elapsed;
  const min = state.clip * state.fps;
  const max = state.totalClip * state.fps;
  const progress = max > min ? Math.min(1, Math.max(0, (elapsed * state.fps - min) / (max - min))) : 0;
  return {
    playing: true,
    time: fromSeconds(shown, state.fps, options.dropFrame),
    inTime: fromSeconds(state.clip, state.fps, options.dropFrame),
    outTime: fromSeconds(state.totalClip, state.fps, options.dropFrame),
    progress,
    paused: state.paused,
    loop: state.loop
  };
}

const INT32_MAX = 2_147_483_647;
export const METER_FLOOR_DB = -60;

/** AudioMeterWidget::convertToLevel: volume (int32 full scale) to dBFS, `-61` when below the floor. */
export function toDecibel(value: number): number {
  const minimum = 0.5 / INT32_MAX;
  const db = 20 * Math.log10(Math.max(minimum, value / INT32_MAX));
  return db < METER_FLOOR_DB ? METER_FLOOR_DB - 1 : Math.trunc(db);
}
