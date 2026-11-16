import { BASE_FIELDS } from './base';
import { formatNumber, parseBool, parseFloatOr, parseIntOr } from './format';
import { parseList, stringifyList } from './list';
import { allFields, getItemDefinition } from './registry';
import type { FieldDef, ListField, PropValue, Props, Rundown, RundownGroup, RundownItem, RundownNode, ScalarField } from './types';
import { isGroup } from './types';
import { asArray, group, leaf, parseXml, renderXml, text } from './xml';
import type { RawNode, RawObject, XmlElement } from './xml';

const isTrue = (value: PropValue): boolean => value === true || value === 'true' || value === 1 || value === '1';

function serializeScalar(field: ScalarField, value: PropValue | undefined): string {
  const v = value ?? field.default;
  switch (field.type) {
    case 'bool':
      return isTrue(v) ? 'true' : 'false';
    case 'boolint':
      return isTrue(v) ? '1' : '0';
    case 'int':
      return String(Math.trunc(Number(v)));
    case 'float':
      return formatNumber(Number(v));
    case 'string':
      return String(v);
  }
}

function parseScalar(field: ScalarField, raw: string | undefined): PropValue {
  switch (field.type) {
    case 'bool':
    case 'boolint':
      return parseBool(raw, field.default as boolean);
    case 'int':
      return parseIntOr(raw, field.default as number);
    case 'float':
      return parseFloatOr(raw, field.default as number);
    case 'string':
      return raw ?? (field.default as string);
  }
}

/** A list is written as nested elements, and not at all when it is empty (as the Qt client does). */
function listElements(field: ListField, value: PropValue | undefined): XmlElement[] {
  const entries = parseList(value ?? field.default, field.members);
  if (entries.length === 0) return [];
  return [group(field.key, entries.map((entry) => group(field.entry, field.members.map((member) => text(member, entry[member])))))];
}

function parseListElements(field: ListField, raw: RawNode | RawNode[] | undefined): string {
  if (typeof raw !== 'object' || Array.isArray(raw)) return '';
  const entries = asArray(raw[field.entry])
    .filter((entry): entry is RawObject => typeof entry === 'object')
    .map((entry) => Object.fromEntries(field.members.map((member) => [member, leaf(entry, member) ?? ''])));
  return stringifyList(entries, field.members);
}

function fieldElements(field: FieldDef, value: PropValue | undefined): XmlElement[] {
  return field.type === 'list' ? listElements(field, value) : [text(field.key, serializeScalar(field, value))];
}

function readField(field: FieldDef, raw: RawObject): PropValue {
  if (field.type === 'list') return parseListElements(field, raw[field.key]);
  const present = [field.key, ...(field.aliases ?? [])].map((key) => leaf(raw, key)).find((value) => value !== undefined);
  return parseScalar(field, present);
}

function propElements(fields: readonly FieldDef[], props: Props, written: Set<string>): XmlElement[] {
  return fields.flatMap((field) => {
    written.add(field.key);
    return fieldElements(field, props[field.key]);
  });
}

/** Properties of unknown item types, or unknown extras of known types, are kept verbatim. */
function extraElements(props: Props, written: ReadonlySet<string>): XmlElement[] {
  return Object.entries(props)
    .filter(([key]) => !written.has(key))
    .map(([key, value]) => text(key, String(value)));
}

function itemElement(item: RundownItem): XmlElement {
  const definition = getItemDefinition(item.type);
  const written = new Set<string>();
  const fields = definition ? allFields(definition) : BASE_FIELDS;
  return group('item', [
    text('type', item.type),
    text('devicename', item.deviceName),
    text('label', item.label),
    text('name', item.name),
    ...propElements(fields, item.props, written),
    ...extraElements(item.props, written)
  ]);
}

function groupElement(node: RundownGroup): XmlElement {
  const definition = getItemDefinition('GROUP');
  const written = new Set<string>();
  const fields = definition ? allFields(definition) : BASE_FIELDS;
  return group('item', [
    text('type', 'GROUP'),
    text('label', node.label),
    text('expanded', node.expanded ? 'true' : 'false'),
    ...propElements(fields, node.props, written),
    ...extraElements(node.props, written),
    group('items', node.items.map(itemElement))
  ]);
}

export function nodeElement(node: RundownNode): XmlElement {
  return isGroup(node) ? groupElement(node) : itemElement(node);
}

/** Serialises a rundown to the same XML format as the Qt client (`.xml` rundown files and clipboard). */
export function serializeRundown(rundown: Rundown): string {
  return renderXml(
    group('items', [
      text('allowremotetriggering', rundown.allowRemoteTriggering ? 'true' : 'false'),
      ...rundown.items.map(nodeElement)
    ])
  );
}

/** Serialises just some nodes, as copied to the clipboard (no `allowremotetriggering` element). */
export function serializeNodes(nodes: readonly RundownNode[]): string {
  return renderXml(group('items', nodes.map(nodeElement)));
}

function readProps(raw: RawObject, fields: readonly FieldDef[], skip: ReadonlySet<string>): Props {
  const props: Props = {};
  const known = new Set<string>();
  for (const field of fields) {
    known.add(field.key);
    for (const alias of field.aliases ?? []) known.add(alias);
    props[field.key] = readField(field, raw);
  }
  for (const [key, value] of Object.entries(raw)) {
    if (known.has(key) || skip.has(key) || key.startsWith('#') || typeof value !== 'string') continue;
    props[key] = value;
  }
  return props;
}

const ITEM_LEVEL_KEYS: ReadonlySet<string> = new Set(['type', 'devicename', 'label', 'name', 'expanded', 'items']);

export function parseItemNode(raw: RawObject): RundownNode {
  const type = leaf(raw, 'type') ?? '';
  const definition = getItemDefinition(type);
  const fields = definition ? allFields(definition) : BASE_FIELDS;
  const props = readProps(raw, fields, ITEM_LEVEL_KEYS);

  if (type === 'GROUP') {
    const itemsNode = raw['items'];
    const children =
      itemsNode && typeof itemsNode === 'object' && !Array.isArray(itemsNode)
        ? asArray((itemsNode as RawObject)['item']).filter((n): n is RawObject => typeof n === 'object')
        : [];
    return {
      type: 'GROUP',
      label: leaf(raw, 'label') ?? '',
      expanded: parseBool(leaf(raw, 'expanded'), false),
      props,
      items: children.map(parseItemNode).filter((n): n is RundownItem => !isGroup(n)) // groups cannot be nested
    };
  }

  return {
    type,
    deviceName: leaf(raw, 'devicename') ?? '',
    label: leaf(raw, 'label') ?? '',
    name: leaf(raw, 'name') ?? '',
    props
  };
}

/** Parses a rundown file or clipboard text. Throws when the document has no `<items>` root. */
export function parseRundown(source: string): Rundown {
  const doc = parseXml(source);
  const root = doc['items'];
  if (root === undefined || typeof root === 'string') {
    if (typeof root === 'string') return { allowRemoteTriggering: false, items: [] }; // `<items/>`
    throw new Error('Not a rundown: missing <items> root element');
  }
  const rootObject = root as RawObject;
  return {
    allowRemoteTriggering: parseBool(leaf(rootObject, 'allowremotetriggering'), false),
    items: asArray(rootObject['item'])
      .filter((n): n is RawObject => typeof n === 'object')
      .map(parseItemNode)
  };
}
