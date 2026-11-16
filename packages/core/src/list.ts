import type { PropValue } from './types';

/** One record of a list property (see `ListField`): member name to text. */
export type ListEntry = Record<string, string>;

/** Reads the JSON stored in a list property; malformed or foreign JSON is an empty list. */
export function parseList(json: PropValue | undefined, members: readonly string[]): ListEntry[] {
  if (typeof json !== 'string' || json === '') return [];
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((e): e is Record<string, unknown> => typeof e === 'object' && e !== null)
      .map((e) => Object.fromEntries(members.map((member) => [member, String(e[member] ?? '')])));
  } catch {
    return [];
  }
}

/** The value of a list property: JSON with the members in order, `''` for an empty list. */
export function stringifyList(entries: readonly ListEntry[], members: readonly string[]): string {
  return entries.length === 0 ? '' : JSON.stringify(entries.map((e) => Object.fromEntries(members.map((member) => [member, e[member] ?? '']))));
}
