import type { AnyItemDefinition } from '../definition';
import { group, separator } from './layout';
import { clearOutput, fadeToBlack, fileRecorder, print } from './output';
import { customCommand, gpiOutput, httpGet, httpPost, oscOutput, playoutCommand } from './triggers';

/** Control, output and layout items (group, separator, commands, HTTP, OSC/GPI output, recorder ...). */
export const controlItems: readonly AnyItemDefinition[] = [
  group,
  separator,
  playoutCommand,
  customCommand,
  httpGet,
  httpPost,
  oscOutput,
  gpiOutput,
  print,
  clearOutput,
  fadeToBlack,
  fileRecorder
];
