import { amcp, getItemDefinition } from '@soticaspar/core';
import { backend } from '../lib/backend';
import { holdsClip, stepSeek, type StepUnit } from '../engine/layerState';
import { isGroupNode, type TreeItem } from '../engine/tree';
import { app } from './app.svelte';
import { layerOf, layerStates } from './layerStates.svelte';
import { ui } from './ui.svelte';
import { workspace } from './workspace.svelte';

export type { StepUnit };

/** The selected row when it is a video whose clip is on its layer now: what the step buttons move. */
export function stepTarget(): TreeItem | null {
  workspace.revision;
  layerStates.revision;
  const node = workspace.active.model.currentNode;
  if (!node || isGroupNode(node) || getItemDefinition(node.type)?.timeline !== true || node.deviceName === '') return null;
  return holdsClip(layerStates.get(layerOf(node)), node.name, Date.now()) ? node : null;
}

/** Moves the selected video one frame, second or minute forward (`1`) or back (`-1`) on the server. */
export async function step(unit: StepUnit, direction: 1 | -1): Promise<void> {
  const item = stepTarget();
  if (!item || app.commandsDisabled) return;
  const target = layerOf(item);
  const layer = layerStates.get(target);
  const seek = layer ? stepSeek(layer, unit, direction) : null;
  if (!seek) return;
  const command =
    'relative' in seek ? amcp.seekRelative(target.channel, target.layer, seek.relative) : amcp.seekMovie(target.channel, target.layer, seek.absolute);
  try {
    await backend.sendCustomCommand(item.deviceName, command);
  } catch (error) {
    ui.notify(`Could not move the video: ${error instanceof Error ? error.message : String(error)}`, true);
  }
}
