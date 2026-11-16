import { XMLParser } from 'fast-xml-parser';

/** Minimal XML element tree used for the rundown file format. */
export interface XmlElement {
  name: string;
  /** Text content for leaf elements. */
  text?: string;
  children?: XmlElement[];
}

export const text = (name: string, value: string): XmlElement => ({ name, text: value });
export const group = (name: string, children: XmlElement[]): XmlElement => ({ name, children });

const escapeText = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function renderElement(el: XmlElement, depth: number, indent: string): string {
  const pad = indent.repeat(depth);
  if (el.children) {
    const inner = el.children.map((c) => renderElement(c, depth + 1, indent)).join('');
    return `${pad}<${el.name}>\n${inner}${pad}</${el.name}>\n`;
  }
  return `${pad}<${el.name}>${escapeText(el.text ?? '')}</${el.name}>\n`;
}

/** Renders like QXmlStreamWriter with auto-formatting (4 space indent), as the Qt client writes rundowns. */
export function renderXml(root: XmlElement, indent = '    '): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n${renderElement(root, 0, indent)}`;
}

/** Elements that always parse to arrays, also when there is only one: rundown items and list entries (`componentdata`). */
const ARRAY_ELEMENTS: ReadonlySet<string> = new Set(['item', 'componentdata']);

const parser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false,
  trimValues: false,
  processEntities: true,
  isArray: (name) => ARRAY_ELEMENTS.has(name)
});

/** Raw parsed element: leaf elements are strings, containers are objects. */
export type RawNode = string | { [key: string]: RawNode | RawNode[] | undefined };
export type RawObject = { [key: string]: RawNode | RawNode[] | undefined };

export function parseXml(source: string): RawObject {
  return parser.parse(source) as RawObject;
}

/** Returns the text of a leaf child, `undefined` when it is missing or not a leaf. */
export function leaf(node: RawObject, key: string): string | undefined {
  const value = node[key];
  if (typeof value === 'string') return value;
  return undefined;
}

export function asArray<T extends RawNode>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}
