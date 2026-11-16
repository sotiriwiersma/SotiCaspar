export type PropValue = string | number | boolean;
export type Props = Record<string, PropValue>;

interface FieldBase {
  /** XML element name used by the Qt client, so rundown files stay compatible in both directions. */
  key: string;
  /** Older element names the Qt client still reads (the first present one among `key` and `aliases` wins). Never written. */
  aliases?: readonly string[];
}

export interface ScalarField extends FieldBase {
  /** `boolint` is a bool the Qt client writes as `0`/`1` (QString::number). */
  type: 'string' | 'int' | 'float' | 'bool' | 'boolint';
  /** Value of a missing element, equal to the fallback of the Qt `readProperties`. */
  default: PropValue;
}

/**
 * A list of records the Qt client stores as nested elements, e.g.
 * `<key><entry><member/>...</entry>...</key>`. The property value is a JSON array of `{ [member]: string }`
 * (`''` for an empty list, in which case the Qt client writes no element at all).
 */
export interface ListField extends FieldBase {
  type: 'list';
  default: '';
  /** Element name of one record. */
  entry: string;
  /** Element names inside a record, in write order. */
  members: readonly string[];
}

/** One persisted property of a rundown item. */
export type FieldDef = ScalarField | ListField;

/** A leaf item in a rundown (everything except groups). */
export interface RundownItem {
  id?: string;
  type: string;
  deviceName: string;
  label: string;
  /** Library name, e.g. the media file or template name. */
  name: string;
  /** Every other persisted property, keyed by XML element name. */
  props: Props;
}

export interface RundownGroup {
  id?: string;
  type: 'GROUP';
  label: string;
  expanded: boolean;
  props: Props;
  items: RundownItem[];
}

export type RundownNode = RundownItem | RundownGroup;

export interface Rundown {
  allowRemoteTriggering: boolean;
  items: RundownNode[];
}

export function isGroup(node: RundownNode): node is RundownGroup {
  return node.type === 'GROUP';
}
