import { parseList, stringifyList, type PropValue } from '@soticaspar/core';

export interface KeyValueEntry {
  key: string;
  value: string;
}

/**
 * Item properties holding a list of key/value pairs as JSON. The Qt client edits them in a key/value tree of the
 * inspector; core stores them flat, so the inspector offers an editor for exactly these properties.
 */
export interface DataEditor {
  types: readonly string[];
  /** Property that stores the JSON. */
  prop: string;
  /** Name of the key member inside the stored JSON objects. */
  keyMember: 'id' | 'key';
  title: string;
  keyLabel: string;
  /** Prefix of generated keys (`f0`, `f1` ... as in the Qt template data tree). */
  keyPrefix: string;
}

export const DATA_EDITORS: readonly DataEditor[] = [
  { types: ['TEMPLATE'], prop: 'templatedata', keyMember: 'id', title: 'Template data', keyLabel: 'Field', keyPrefix: 'f' },
  { types: ['HTTPGET', 'HTTPPOST'], prop: 'httpdata', keyMember: 'key', title: 'Request data', keyLabel: 'Key', keyPrefix: 'key' }
];

export const editorFor = (type: string): DataEditor | undefined => DATA_EDITORS.find((e) => e.types.includes(type));

export function parseEntries(json: PropValue | undefined, keyMember: DataEditor['keyMember']): KeyValueEntry[] {
  return parseList(json, [keyMember, 'value']).map((entry) => ({ key: entry[keyMember], value: entry.value }));
}

export function stringifyEntries(entries: readonly KeyValueEntry[], keyMember: DataEditor['keyMember']): string {
  return stringifyList(
    entries.map((entry) => ({ [keyMember]: entry.key, value: entry.value })),
    [keyMember, 'value']
  );
}

/** The next unused generated key (`f0`, `f1` ...). */
export function nextKey(entries: readonly KeyValueEntry[], prefix: string): string {
  const used = new Set(entries.map((e) => e.key));
  let n = 0;
  while (used.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}
