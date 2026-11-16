import { COMMON_BLOCKS, getItemDefinition } from '@soticaspar/core';

/** Which of the standard blocks (target, channel, layer ...) apply to an item type. */
export type CommonFields = Record<(typeof COMMON_BLOCKS)[number], boolean>;

/** The standard inspector blocks the Qt InspectorOutputWidget leaves enabled for an item type (see `hiddenCommonBlocks`). */
export function commonFields(type: string): CommonFields {
  const hidden = getItemDefinition(type)?.hiddenCommonBlocks ?? [];
  return Object.fromEntries(COMMON_BLOCKS.map((block) => [block, !hidden.includes(block)])) as CommonFields;
}
