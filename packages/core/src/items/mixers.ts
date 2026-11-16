import type { AnyItemDefinition } from '../definition';
import { anchor } from './anchor';
import { blendmode } from './blendmode';
import { brightness } from './brightness';
import { chromakey } from './chromakey';
import { clip } from './clip';
import { commit } from './commit';
import { contrast } from './contrast';
import { crop } from './crop';
import { fill } from './fill';
import { grid } from './grid';
import { keyer } from './keyer';
import { levels } from './levels';
import { opacity } from './opacity';
import { perspective } from './perspective';
import { reset } from './reset';
import { rotation } from './rotation';
import { saturation } from './saturation';
import { volume } from './volume';

/** Mixer items (opacity, fill, levels ...). */
export const mixerItems: readonly AnyItemDefinition[] = [
  anchor, blendmode, brightness, chromakey, clip, commit, contrast, crop, fill, grid, keyer, levels, opacity, perspective, reset,
  rotation, saturation, volume
];
