import type { AnyItemDefinition } from '../definition';
import { getItemDefinition, registerItem } from '../registry';
import { controlItems } from './controls';
import { mixerItems } from './mixers';
import { producerItems } from './producers';

export { parseTemplateData, stringifyTemplateData, templateDataString } from './template';
export type { TemplateDataEntry } from './template';
export { premultipliedColor } from './solidcolor';

/** Every built-in item type. Each group lives in its own module. */
export const builtinItems: readonly AnyItemDefinition[] = [...producerItems, ...mixerItems, ...controlItems];

let registered = false;

/** Registers all built-in item types. Safe to call more than once. */
export function registerBuiltinItems(): void {
  if (registered) return;
  registered = true;
  for (const item of builtinItems) {
    if (!getItemDefinition(item.type)) registerItem(item);
  }
}

registerBuiltinItems();
