import type { ControlCommand, PlayoutType } from '@soticaspar/core';
import type { RundownEngine } from './engine';
import { isGroupNode, walkNodes, type TreeNode } from './tree';

/** Remote control command names (`/control/<name>`) and the playout trigger they fire. */
export const REMOTE_TRIGGERS: Readonly<Record<string, PlayoutType>> = {
  stop: 'Stop',
  play: 'Play',
  playnow: 'PlayNow',
  load: 'Load',
  pause: 'PauseResume',
  next: 'Next',
  update: 'Update',
  invoke: 'Invoke',
  preview: 'Preview',
  clear: 'Clear',
  clearvideolayer: 'ClearVideoLayer',
  clearchannel: 'ClearChannel'
};

export interface RemoteContext {
  /** The rundown of the selected tab, `null` before any exists. */
  active: RundownEngine | null;
  all: readonly RundownEngine[];
  previewOnAutoStep: boolean;
  hasDevice(name: string): boolean;
}

/** OSC arguments are compared the way Qt's `QVariant::toInt() > 0` does. */
function pressed(args: ControlCommand['args']): boolean {
  const value = args[0];
  if (typeof value === 'number') return Math.trunc(value) > 0;
  if (typeof value === 'string') return Number.parseInt(value, 10) > 0;
  return value === true;
}

function toInt(value: string | number | boolean | null | undefined): number {
  if (typeof value === 'number') return Math.trunc(value);
  if (typeof value === 'string') return Number.parseInt(value, 10);
  return value === true ? 1 : 0;
}

const flag = (node: TreeNode, key: string): boolean => node.props[key] === true || node.props[key] === 'true';

/** Item addressed by `/control/<uid>/<command>`: allowed items with that remote trigger id. */
function routeToItems(command: ControlCommand, trigger: PlayoutType, engines: readonly RundownEngine[]): void {
  for (const engine of engines) {
    for (const node of walkNodes(engine.model.nodes)) {
      const uid = String(node.props.remotetriggerid ?? '').trim();
      if (!flag(node, 'allowremotetriggering') || uid === '' || uid !== command.uid) continue;
      // Groups run through the tree (auto-step, queues); single items execute on their own, as in the Qt widgets.
      if (isGroupNode(node)) engine.trigger(trigger, node.id);
      else engine.executeDirect(trigger, node.id);
    }
  }
}

function playNowIfChannel(engine: RundownEngine, channel: number, hasDevice: (name: string) => boolean): void {
  const current = engine.model.currentNode;
  if (!current) return;
  const matches = (node: TreeNode): boolean => !isGroupNode(node) && hasDevice(node.deviceName) && toInt(node.props.channel) === channel;
  if (isGroupNode(current)) {
    for (const child of current.items) if (matches(child)) engine.trigger('PlayNow', child.id);
  } else if (matches(current)) engine.trigger('PlayNow', current.id);
}

/** Routes a backend `control-command` event, like the OSC control subscriptions of the Qt rundown widgets. */
export function routeControl(command: ControlCommand, context: RemoteContext): void {
  const name = command.command.toLowerCase();
  const trigger = REMOTE_TRIGGERS[name];

  if (command.uid !== undefined) {
    if (trigger && pressed(command.args)) routeToItems(command, trigger, context.all);
    return;
  }

  const engine = context.active;
  if (!engine || !engine.model.allowRemote) return;
  const model = engine.model;

  if (name === 'up' || name === 'down') {
    if (pressed(command.args)) model.stepCurrent(name === 'up' ? -1 : 1);
    return;
  }
  if (model.current === null) return;

  if (name === 'playnowifchannel') {
    if (command.args.length > 0) playNowIfChannel(engine, toInt(command.args[0]), context.hasDevice);
  } else if (name === 'playandautostep' || name === 'playnowandautostep') {
    if (!pressed(command.args)) return;
    engine.trigger(name === 'playandautostep' ? 'Play' : 'PlayNow');
    model.stepCurrent(1);
  } else if (trigger && pressed(command.args)) {
    if (trigger === 'Preview' && context.previewOnAutoStep) return;
    engine.trigger(trigger);
  }
}
