/** Static lookup lists (originally seeded into the SQLite database of the Qt client). */

export const BLEND_MODES = [
  'Normal', 'Lighten', 'Darken', 'Multiply', 'Average', 'Add', 'Subtract', 'Difference', 'Negation', 'Exclusion',
  'Screen', 'Overlay', 'Soft_Light', 'Hard_Light', 'Color_Dodge', 'Color_Burn', 'Linear_Dodge', 'Linear_Burn',
  'Linear_Light', 'Vivid_Light', 'Pin_Light', 'Hard_Mix', 'Reflect', 'Glow', 'Phoenix', 'Contrast', 'Saturation',
  'Color', 'Luminosity'
] as const;

export const CHROMA_KEYS = ['None', 'Green', 'Blue'] as const;
export const DIRECTIONS = ['RIGHT', 'LEFT'] as const;
export const TRANSITIONS = ['CUT', 'MIX', 'PUSH', 'SLIDE', 'WIPE'] as const;

export const TWEENS = [
  'Linear', 'EaseNone',
  'EaseInQuad', 'EaseOutQuad', 'EaseInOutQuad', 'EaseOutInQuad',
  'EaseInCubic', 'EaseOutCubic', 'EaseInOutCubic', 'EaseOutInCubic',
  'EaseInQuart', 'EaseOutQuart', 'EaseInOutQuart', 'EaseOutInQuart',
  'EaseInQuint', 'EaseOutQuint', 'EaseInOutQuint', 'EaseOutInQuint',
  'EaseInSine', 'EaseOutSine', 'EaseInOutSine', 'EaseOutInSine',
  'EaseInExpo', 'EaseOutExpo', 'EaseInOutExpo', 'EaseOutInExpo',
  'EaseInCirc', 'EaseOutCirc', 'EaseInOutCirc', 'EaseOutInCirc',
  'EaseInElastic', 'EaseOutElastic', 'EaseInOutElastic', 'EaseOutInElastic',
  'EaseInBack', 'EaseOutBack', 'EaseInOutBack', 'EaseOutInBack',
  'EaseOutBounce', 'EaseInBounce', 'EaseInOutBounce', 'EaseOutInBounce'
] as const;

export interface VideoFormat {
  name: string;
  width: number;
  height: number;
  framesPerSecond: number;
}

// The NTSC family runs at x/1.001, not at the rounded 23.98 / 29.97 / 59.94: the rounding drifts by about
// 0.6 s per hour at 23.976 fps.
const F2398 = 24000 / 1001;
const F2997 = 30000 / 1001;
const F5994 = 60000 / 1001;

const fmt = (name: string, width: number, height: number, framesPerSecond: number): VideoFormat => ({
  name, width, height, framesPerSecond
});

export const FORMATS: readonly VideoFormat[] = [
  fmt('PAL', 720, 576, 25), fmt('NTSC', 720, 486, F2997), fmt('576p2500', 1024, 576, 25),
  fmt('720p2398', 1280, 720, F2398), fmt('720p2400', 1280, 720, 24), fmt('720p2500', 1280, 720, 25),
  fmt('720p5000', 1280, 720, 50), fmt('720p2997', 1280, 720, F2997), fmt('720p5994', 1280, 720, F5994),
  fmt('720p3000', 1280, 720, 30), fmt('720p6000', 1280, 720, 60),
  fmt('1080p2398', 1920, 1080, F2398), fmt('1080p2400', 1920, 1080, 24), fmt('1080i5000', 1920, 1080, 25),
  fmt('1080i5994', 1920, 1080, F2997), fmt('1080i6000', 1920, 1080, 30), fmt('1080p2500', 1920, 1080, 25),
  fmt('1080p2997', 1920, 1080, F2997), fmt('1080p3000', 1920, 1080, 30), fmt('1080p5000', 1920, 1080, 50),
  fmt('1080p5994', 1920, 1080, F5994), fmt('1080p6000', 1920, 1080, 60),
  fmt('1556p2398', 2048, 1556, F2398), fmt('1556p2400', 2048, 1556, 24), fmt('1556p2500', 2048, 1556, 25),
  fmt('2160p2398', 3840, 2160, F2398), fmt('2160p2400', 3840, 2160, 24), fmt('2160p2500', 3840, 2160, 25),
  fmt('2160p2997', 3840, 2160, F2997), fmt('2160p3000', 3840, 2160, 30), fmt('2160p5000', 3840, 2160, 50),
  fmt('2160p5994', 3840, 2160, F5994), fmt('2160p6000', 3840, 2160, 60),
  fmt('dci1080p2398', 2048, 1080, F2398), fmt('dci1080p2400', 2048, 1080, 24), fmt('dci1080p2500', 2048, 1080, 25),
  fmt('dci2160p2398', 4096, 2160, F2398), fmt('dci2160p2400', 4096, 2160, 24), fmt('dci2160p2500', 4096, 2160, 25),
  fmt('4kDCIp2398', 4096, 2160, F2398), fmt('4kDCIp2400', 4096, 2160, 24), fmt('4kDCIp2500', 4096, 2160, 25),
  fmt('4kDCIp2997', 4096, 2160, F2997), fmt('4kDCIp3000', 4096, 2160, 30), fmt('4kDCIp5000', 4096, 2160, 50),
  fmt('4kDCIp5994', 4096, 2160, F5994), fmt('4kDCIp6000', 4096, 2160, 60)
];

export const LOOKUPS = {
  blendmode: BLEND_MODES,
  chroma: CHROMA_KEYS,
  direction: DIRECTIONS,
  transition: TRANSITIONS,
  tween: TWEENS,
  format: FORMATS.map((f) => f.name)
} as const;

export type LookupName = keyof typeof LOOKUPS;

/** Option lists that depend on the application configuration and are resolved by the UI (OSC outputs). */
export type ConfigLookupName = 'oscoutput';

export function framesPerSecond(formatName: string): number {
  return FORMATS.find((f) => f.name === formatName)?.framesPerSecond ?? 25;
}
