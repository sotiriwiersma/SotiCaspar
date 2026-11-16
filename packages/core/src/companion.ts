/**
 * Bitfocus Companion remote control over TCP or UDP (Companion's "TCP Listener" / "UDP Listener" settings).
 *
 * One command per line (TCP lines end with a newline, a UDP datagram holds one command):
 * `LOCATION <page>/<row>/<column> PRESS|DOWN|UP`. Pages count from 1, rows and columns from 0.
 */

export const COMPANION_ACTIONS = ['Press', 'Down', 'Up'] as const;
export type CompanionAction = (typeof COMPANION_ACTIONS)[number];

/** A button and what to do with it. */
export interface CompanionPress {
  page: number;
  row: number;
  column: number;
  action: CompanionAction;
}

export type CompanionProtocol = 'TCP' | 'UDP';

/** Companion's own default for both listeners. */
export const COMPANION_DEFAULT_PORT = 16759;

/** The action as written by the user or stored in a rundown, or null when it is not one Companion knows. */
export function companionAction(value: unknown): CompanionAction | null {
  return COMPANION_ACTIONS.find((a) => a.toLowerCase() === String(value ?? '').trim().toLowerCase()) ?? null;
}

/** A complete press from item properties, or null when the button address is incomplete. */
export function companionPress(p: { page: unknown; row: unknown; column: unknown; action: unknown }): CompanionPress | null {
  const whole = (n: unknown, min: number): number | null => {
    const value = Number(n);
    return Number.isInteger(value) && value >= min ? value : null;
  };
  const page = whole(p.page, 1);
  const row = whole(p.row, 0);
  const column = whole(p.column, 0);
  const action = companionAction(p.action);
  return page === null || row === null || column === null || action === null ? null : { page, row, column, action };
}

/** The command line for a press, without the line ending. */
export const companionCommand = (press: CompanionPress): string =>
  `LOCATION ${press.page}/${press.row}/${press.column} ${press.action.toUpperCase()}`;
