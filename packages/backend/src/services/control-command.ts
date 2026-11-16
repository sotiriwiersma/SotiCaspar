import type { ControlCommand } from '@soticaspar/core';

const ITEM_COMMANDS = new Set([
  'stop',
  'play',
  'playnow',
  'load',
  'pause',
  'next',
  'update',
  'invoke',
  'preview',
  'clear',
  'clearvideolayer',
  'clearchannel'
]);

const RUNDOWN_COMMANDS = new Set([...ITEM_COMMANDS, 'up', 'down', 'playnowifchannel', 'playandautostep', 'playnowandautostep']);

const CONTROL_PATH = /^\/control\/(?:([^/]+)\/)?([^/]+)$/;

export function isControlPath(path: string): boolean {
  return path.startsWith('/control');
}

/**
 * Parses `/control/<cmd>` (rundown wide) and `/control/<uid>/<cmd>` (one item).
 * Returns `undefined` for anything else, including unknown commands.
 */
export function parseControlCommand(path: string, args: ControlCommand['args']): ControlCommand | undefined {
  const match = CONTROL_PATH.exec(path);
  if (!match) return undefined;
  const [, uid, command] = match;
  if (!(uid === undefined ? RUNDOWN_COMMANDS : ITEM_COMMANDS).has(command)) return undefined;
  return uid === undefined ? { command, args } : { uid, command, args };
}
