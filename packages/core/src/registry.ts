import { BASE_FIELDS } from './base';
import type { AnyItemDefinition } from './definition';
import type { FieldDef, Props, RundownItem } from './types';

const definitions = new Map<string, AnyItemDefinition>();

export function registerItem(definition: AnyItemDefinition): void {
  if (definitions.has(definition.type)) throw new Error(`Item type ${definition.type} is already registered`);
  definitions.set(definition.type, definition);
}

export function getItemDefinition(type: string): AnyItemDefinition | undefined {
  return definitions.get(type);
}

export function listItemDefinitions(): AnyItemDefinition[] {
  return [...definitions.values()];
}

/** Every persisted property of an item type in XML order. */
export function allFields(definition: AnyItemDefinition): FieldDef[] {
  return [...BASE_FIELDS, ...definition.fields, ...definition.widgetFields];
}

/** Values of a newly created item: the field defaults, then the type's constructor defaults (see `ItemDefinition.defaults`). */
export function defaultProps(definition: AnyItemDefinition): Props {
  const props: Props = {};
  for (const field of allFields(definition)) props[field.key] = field.default;
  return { ...props, ...definition.defaults };
}

export interface NewItemInit {
  name?: string;
  label?: string;
  deviceName?: string;
  props?: Props;
}

/** Creates an item with all defaults filled in, e.g. when dropping a library entry on the rundown. */
export function createItem(type: string, init: NewItemInit = {}): RundownItem {
  const definition = getItemDefinition(type);
  if (!definition) throw new Error(`Unknown item type ${type}`);
  return {
    type,
    deviceName: init.deviceName ?? '',
    label: init.label ?? init.name ?? '',
    name: init.name ?? '',
    props: { ...defaultProps(definition), ...init.props }
  };
}
