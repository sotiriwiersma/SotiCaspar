/**
 * Pure AMCP command builders (port of CasparDevice in the Qt client).
 *
 * Every builder returns the command text without the trailing CRLF. Empty optional parts are
 * dropped and parts are joined by a single space, which is equivalent for the AMCP parser
 * but easier to read and test than the Qt output with its stray spaces.
 */
import { formatNumber as n } from './format';

type Part = string | number | false | null | undefined;

function line(...parts: Part[]): string {
  return parts
    .filter((p): p is string | number => p !== false && p !== null && p !== undefined && p !== '')
    .map((p) => (typeof p === 'number' ? n(p) : p))
    .join(' ');
}

const target = (channel: number, layer: number) => `${channel}-${layer}`;
const defer = (on: boolean) => on && 'DEFER';

/** Escapes a value that is wrapped in double quotes in an AMCP command. */
export const quote = (value: string) => `"${value}"`;

// ---------------------------------------------------------------- Queries

export const refreshData = () => 'DATA LIST';
export const refreshFlashVersion = () => 'VERSION FLASH';
export const refreshServerVersion = () => 'VERSION SERVER';
export const refreshTemplateHostVersion = () => 'VERSION TEMPLATEHOST';
export const refreshMedia = () => 'CLS';
export const refreshTemplate = () => 'TLS';
export const refreshChannels = () => 'INFO';
export const refreshThumbnails = () => 'THUMBNAIL LIST';
export const retrieveThumbnail = (name: string) => `THUMBNAIL RETRIEVE ${quote(name)}`;
export const retrieveData = (name: string) => `DATA RETRIEVE ${quote(name)}`;

// ---------------------------------------------------------------- Basic playout

export const clearChannel = (channel: number) => `CLEAR ${channel}`;
export const clearMixerChannel = (channel: number) => `MIXER ${channel} CLEAR`;
export const clearVideolayer = (channel: number, layer: number) => `CLEAR ${target(channel, layer)}`;
export const clearMixerVideolayer = (channel: number, layer: number) => `MIXER ${target(channel, layer)} CLEAR`;
export const pause = (channel: number, layer: number) => `PAUSE ${target(channel, layer)}`;
export const resume = (channel: number, layer: number) => `RESUME ${target(channel, layer)}`;
export const stop = (channel: number, layer: number) => `STOP ${target(channel, layer)}`;
export const play = (channel: number, layer: number) => `PLAY ${target(channel, layer)}`;
export const print = (channel: number, output: string) => `ADD ${channel} IMAGE ${quote(output)}`;

// ---------------------------------------------------------------- Routing

export const loadRouteChannel = (toChannel: number, toLayer: number, fromChannel: number, outputDelay?: number) =>
  line('LOADBG', target(toChannel, toLayer), `route://${fromChannel}`, outputDelay !== undefined && `FRAMES_DELAY ${outputDelay}`);

export const playRouteChannel = (toChannel: number, toLayer: number, fromChannel: number, outputDelay?: number) =>
  line('PLAY', target(toChannel, toLayer), `route://${fromChannel}`, outputDelay !== undefined && `FRAMES_DELAY ${outputDelay}`);

export const loadRouteVideolayer = (toChannel: number, toLayer: number, fromChannel: number, fromLayer: number, outputDelay?: number) =>
  line('LOADBG', target(toChannel, toLayer), `route://${target(fromChannel, fromLayer)}`, outputDelay !== undefined && `FRAMES_DELAY ${outputDelay}`);

export const playRouteVideolayer = (toChannel: number, toLayer: number, fromChannel: number, fromLayer: number, outputDelay?: number) =>
  line('PLAY', target(toChannel, toLayer), `route://${target(fromChannel, fromLayer)}`, outputDelay !== undefined && `FRAMES_DELAY ${outputDelay}`);

// ---------------------------------------------------------------- Templates (CG)

const cg = (channel: number, layer: number, verb: string, flashLayer: number, ...rest: Part[]) =>
  line('CG', target(channel, layer), verb, flashLayer, ...rest);

export const addTemplate = (channel: number, layer: number, flashLayer: number, name: string, playOnLoad: boolean, data?: string) =>
  data === undefined
    ? cg(channel, layer, 'ADD', flashLayer, quote(name), playOnLoad ? '1' : '0')
    : cg(channel, layer, 'ADD', flashLayer, name, playOnLoad ? '1' : '0', quote(data));

export const invokeTemplate = (channel: number, layer: number, flashLayer: number, label: string) =>
  cg(channel, layer, 'INVOKE', flashLayer, quote(label.replace(/\\/g, '\\\\').replace(/"/g, '\\"')));

export const nextTemplate = (channel: number, layer: number, flashLayer: number) => cg(channel, layer, 'NEXT', flashLayer);

/** Plays a template that is already added, or adds-and-plays it when a name is given. */
export const playTemplate = (channel: number, layer: number, flashLayer: number, name?: string, data?: string) => {
  if (name === undefined) return cg(channel, layer, 'PLAY', flashLayer);
  return cg(channel, layer, 'ADD', flashLayer, quote(name), '1', data !== undefined && quote(data));
};

export const removeTemplate = (channel: number, layer: number, flashLayer: number) => cg(channel, layer, 'REMOVE', flashLayer);
export const stopTemplate = (channel: number, layer: number, flashLayer: number) => cg(channel, layer, 'STOP', flashLayer);
export const updateTemplate = (channel: number, layer: number, flashLayer: number, data: string) =>
  cg(channel, layer, 'UPDATE', flashLayer, quote(data));

// ---------------------------------------------------------------- Producers

const transitionParts = (transition: string, duration: number, easing: string, direction: string) =>
  [transition, duration, easing, direction] as const;

export const playHtml = (channel: number, layer: number, url: string, transition: string, duration: number, easing: string, direction: string, useAuto: boolean) =>
  useAuto
    ? loadHtml(channel, layer, url, transition, duration, easing, direction, false, true)
    : line('PLAY', target(channel, layer), '[HTML]', quote(url), ...transitionParts(transition, duration, easing, direction));

export const loadHtml = (channel: number, layer: number, url: string, transition: string, duration: number, easing: string, direction: string, freezeOnLoad: boolean, useAuto: boolean) =>
  line(freezeOnLoad ? 'LOAD' : 'LOADBG', target(channel, layer), '[HTML]', quote(url), ...transitionParts(transition, duration, easing, direction), useAuto && 'AUTO');

export const playMovie = (channel: number, layer: number, name: string, transition: string, duration: number, easing: string, direction: string, seek: number, length: number, loop: boolean, useAuto: boolean) =>
  useAuto
    ? loadMovie(channel, layer, name, transition, duration, easing, direction, seek, length, loop, false, true)
    : line('PLAY', target(channel, layer), quote(name), ...transitionParts(transition, duration, easing, direction),
        seek > 0 && `SEEK ${seek}`, length > 0 && `LENGTH ${length}`, loop && 'LOOP');

export const loadMovie = (channel: number, layer: number, name: string, transition: string, duration: number, easing: string, direction: string, seek: number, length: number, loop: boolean, freezeOnLoad: boolean, useAuto: boolean) =>
  line(freezeOnLoad ? 'LOAD' : 'LOADBG', target(channel, layer), quote(name), ...transitionParts(transition, duration, easing, direction),
    seek > 0 && `SEEK ${seek}`, length > 0 && `LENGTH ${length}`, loop && 'LOOP', useAuto && 'AUTO');

export const playAudio = (channel: number, layer: number, name: string, transition: string, duration: number, easing: string, direction: string, loop: boolean, useAuto: boolean) =>
  useAuto
    ? loadAudio(channel, layer, name, transition, duration, easing, direction, loop, true)
    : line('PLAY', target(channel, layer), quote(name), ...transitionParts(transition, duration, easing, direction), loop && 'LOOP');

export const loadAudio = (channel: number, layer: number, name: string, transition: string, duration: number, easing: string, direction: string, loop: boolean, useAuto: boolean) =>
  line('LOADBG', target(channel, layer), quote(name), ...transitionParts(transition, duration, easing, direction), loop && 'LOOP', useAuto && 'AUTO');

export const playColor = (channel: number, layer: number, color: string, transition: string, duration: number, easing: string, direction: string, useAuto: boolean) =>
  useAuto
    ? loadColor(channel, layer, color, transition, duration, easing, direction, true)
    : line('PLAY', target(channel, layer), quote(color), ...transitionParts(transition, duration, easing, direction));

export const loadColor = (channel: number, layer: number, color: string, transition: string, duration: number, easing: string, direction: string, useAuto: boolean) =>
  line('LOADBG', target(channel, layer), quote(color), ...transitionParts(transition, duration, easing, direction), useAuto && 'AUTO');

export const playStill = (channel: number, layer: number, name: string, transition: string, duration: number, easing: string, direction: string, useAuto: boolean) =>
  useAuto
    ? loadStill(channel, layer, name, transition, duration, easing, direction, true)
    : line('PLAY', target(channel, layer), quote(name), ...transitionParts(transition, duration, easing, direction));

export const loadStill = (channel: number, layer: number, name: string, transition: string, duration: number, easing: string, direction: string, useAuto: boolean) =>
  line('LOADBG', target(channel, layer), quote(name), ...transitionParts(transition, duration, easing, direction), useAuto && 'AUTO');

export const playDeviceInput = (channel: number, layer: number, device: number, format: string) =>
  `PLAY ${target(channel, layer)} DECKLINK DEVICE ${device} FORMAT ${format}`;

export const loadDeviceInput = (channel: number, layer: number, device: number, format: string) =>
  `LOADBG ${target(channel, layer)} DECKLINK DEVICE ${device} FORMAT ${format}`;

export const playImageScroll = (channel: number, layer: number, name: string, blur: number, speed: number, premultiply: boolean, progressive: boolean) =>
  line('PLAY', target(channel, layer), quote(name), `BLUR ${blur}`, `SPEED ${speed}`, premultiply && 'PREMULTIPLY', progressive && 'PROGRESSIVE');

export const loadImageScroll = (channel: number, layer: number, name: string, blur: number, speed: number, premultiply: boolean, progressive: boolean) =>
  line('LOADBG', target(channel, layer), quote(name), `BLUR ${blur}`, `SPEED ${speed}`, premultiply && 'PREMULTIPLY', progressive && 'PROGRESSIVE');

// ---------------------------------------------------------------- Consumers (recording / streaming)

/** Stable per-file consumer index (the Qt client used qChecksum, CRC-16/X-25). */
export function consumerIndex(filename: string): number {
  let crc = 0xffff;
  for (const byte of new TextEncoder().encode(filename)) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = crc & 1 ? (crc >>> 1) ^ 0x8408 : crc >>> 1;
  }
  return ~crc & 0xffff;
}

export const startFileRecorder = (channel: number, filename: string, preset: string, withAlpha: boolean) =>
  line('ADD', `${channel}-${consumerIndex(filename)}`, 'FILE', quote(filename), preset, withAlpha && 'SEPARATE_KEY');

export const stopFileRecorder = (channel: number, filename: string) => `REMOVE ${channel}-${consumerIndex(filename)} FILE`;

/** `<client_ip_address>` is substituted by the caller with the address the server should stream to. */
export const startStream = (channel: number, port: number, quality: number, key: boolean, width: number, height: number) =>
  width > 0 && height > 0
    ? `ADD ${channel} STREAM udp://<client_ip_address>:${port} -format mpegts -codec:v libx264 -crf:v ${quality} -tune:v zerolatency -preset:v ultrafast -filter:v ${key ? 'alphaextract,format=pix_fmts=yuv422p,' : ''}scale=${width}:${height} -filter:a "pan=stereo|c0=FL|c1=FR"`
    : line('ADD', channel, 'STREAM', `udp://<client_ip_address>:${port}`, '-format mpegts -codec:v libx264', `-crf:v ${quality}`, '-tune:v zerolatency -preset:v ultrafast', key && '-filter:v alphaextract', '-filter:a "pan=stereo|c0=FL|c1=FR"');

export const stopStream = (channel: number, port: number) => `REMOVE ${channel} STREAM udp://<client_ip_address>:${port}`;

/** Picture sizes of the Live panel stream (the compact size is Stream::COMPACT_WIDTH/HEIGHT of the Qt client). */
export const WEB_STREAM_PROFILES = {
  compact: { width: 288, height: 162, videoKbps: 800 },
  large: { width: 960, height: 540, videoKbps: 4000 }
} as const;

export type WebStreamProfile = (typeof WEB_STREAM_PROFILES)[keyof typeof WEB_STREAM_PROFILES];

/**
 * Live panel stream that a browser can decode (JSMpeg): MPEG-1 video without B-frames and MP2 audio in
 * MPEG-TS. The Qt client streamed H.264 for libvlc instead. Stopped with `stopStream`.
 */
export const startWebStream = (channel: number, port: number, key: boolean, profile: WebStreamProfile) =>
  `ADD ${channel} STREAM udp://<client_ip_address>:${port} -format mpegts -codec:v mpeg1video -b:v ${profile.videoKbps}k -bf:v 0 ` +
  `-filter:v ${key ? 'alphaextract,' : ''}scale=${profile.width}:${profile.height} -codec:a mp2 -b:a 128k -filter:a "pan=stereo|c0=FL|c1=FR"`;

// ---------------------------------------------------------------- Mixer

const mixer = (channel: number, layer: number, verb: string, ...rest: Part[]) =>
  line('MIXER', target(channel, layer), verb, ...rest);

/** Optional tween: `[duration, easing]` are only sent when `duration` is provided. */
export interface Tween {
  duration: number;
  easing: string;
}
const tween = (t?: Tween): Part[] => (t ? [t.duration, t.easing] : []);

export const setReset = (channel: number, layer: number) => `MIXER ${target(channel, layer)} CLEAR`;
export const setCommit = (channel: number) => `MIXER ${channel} COMMIT`;
export const setMasterVolume = (channel: number, masterVolume: number) => line('MIXER', channel, 'MASTERVOLUME', masterVolume);
export const setChroma = (channel: number, layer: number, key: string, threshold: number, spread: number, spill: number) =>
  mixer(channel, layer, 'CHROMA', key, threshold, spread, spill);
export const setBlendMode = (channel: number, layer: number, blendMode: string) => mixer(channel, layer, 'BLEND', blendMode);
export const setGrid = (channel: number, grid: number, duration: number, easing: string, deferred: boolean) =>
  line('MIXER', channel, 'GRID', grid, duration, easing, defer(deferred));
export const setKeyer = (channel: number, layer: number, keyer: number, deferred: boolean) =>
  mixer(channel, layer, 'KEYER', keyer, defer(deferred));
export const setVolume = (channel: number, layer: number, volume: number, deferred: boolean, t?: Tween) =>
  mixer(channel, layer, 'VOLUME', volume, ...tween(t), defer(deferred));
export const setOpacity = (channel: number, layer: number, opacity: number, deferred: boolean, t?: Tween) =>
  mixer(channel, layer, 'OPACITY', opacity, ...tween(t), defer(deferred));
export const setBrightness = (channel: number, layer: number, brightness: number, deferred: boolean, t?: Tween) =>
  mixer(channel, layer, 'BRIGHTNESS', brightness, ...tween(t), defer(deferred));
export const setContrast = (channel: number, layer: number, contrast: number, deferred: boolean, t?: Tween) =>
  mixer(channel, layer, 'CONTRAST', contrast, ...tween(t), defer(deferred));
export const setSaturation = (channel: number, layer: number, saturation: number, deferred: boolean, t?: Tween) =>
  mixer(channel, layer, 'SATURATION', saturation, ...tween(t), defer(deferred));
export const setLevels = (channel: number, layer: number, minIn: number, maxIn: number, gamma: number, minOut: number, maxOut: number, deferred: boolean, t?: Tween) =>
  mixer(channel, layer, 'LEVELS', minIn, maxIn, gamma, minOut, maxOut, ...tween(t), defer(deferred));

const mipmap = (channel: number, layer: number, useMipmap: boolean) => mixer(channel, layer, 'MIPMAP', useMipmap ? '1' : '0');

/** Returns two commands: the MIPMAP toggle followed by FILL. */
export const setFill = (channel: number, layer: number, x: number, y: number, scaleX: number, scaleY: number, deferred: boolean, useMipmap: boolean, t?: Tween) => [
  mipmap(channel, layer, useMipmap),
  mixer(channel, layer, 'FILL', x, y, scaleX, scaleY, ...tween(t), defer(deferred))
];

export const setClipping = (channel: number, layer: number, x: number, y: number, scaleX: number, scaleY: number, deferred: boolean, t?: Tween) =>
  mixer(channel, layer, 'CLIP', x, y, scaleX, scaleY, ...tween(t), defer(deferred));

export const setCrop = (channel: number, layer: number, upperLeftX: number, upperLeftY: number, lowerRightX: number, lowerRightY: number, deferred: boolean, t?: Tween) =>
  mixer(channel, layer, 'CROP', upperLeftX, upperLeftY, lowerRightX, lowerRightY, ...tween(t), defer(deferred));

/** Returns two commands: the MIPMAP toggle followed by PERSPECTIVE. */
export const setPerspective = (
  channel: number, layer: number,
  ulX: number, ulY: number, urX: number, urY: number, lrX: number, lrY: number, llX: number, llY: number,
  deferred: boolean, useMipmap: boolean, t?: Tween
) => [
  mipmap(channel, layer, useMipmap),
  mixer(channel, layer, 'PERSPECTIVE', ulX, ulY, urX, urY, lrX, lrY, llX, llY, ...tween(t), defer(deferred))
];

export const setRotation = (channel: number, layer: number, rotation: number, deferred: boolean, t?: Tween) =>
  mixer(channel, layer, 'ROTATION', rotation, ...tween(t), defer(deferred));

export const setAnchor = (channel: number, layer: number, x: number, y: number, deferred: boolean, t?: Tween) =>
  mixer(channel, layer, 'ANCHOR', x, y, ...tween(t), defer(deferred));
