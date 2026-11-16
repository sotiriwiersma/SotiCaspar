import { COMMANDS, type CommandId } from '../../shared/commands';

interface Chord {
  key: string;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
}

function parse(accelerator: string): Chord {
  const parts = accelerator.split('+');
  const key = parts.pop() ?? '';
  const chord: Chord = { key: key.toLowerCase(), ctrl: false, shift: false, alt: false };
  for (const part of parts) {
    const p = part.toLowerCase();
    if (p === 'cmdorctrl' || p === 'ctrl') chord.ctrl = true;
    else if (p === 'shift') chord.shift = true;
    else if (p === 'alt') chord.alt = true;
  }
  return chord;
}

const ALIASES: Readonly<Record<string, string>> = { ins: 'insert', del: 'delete' };

const CHORDS = (Object.keys(COMMANDS) as CommandId[])
  .filter((id) => COMMANDS[id].accelerator)
  .map((id) => ({ id, chord: parse(COMMANDS[id].accelerator as string) }));

/** The command whose accelerator matches the key event, if any. */
export function commandForKey(event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>): CommandId | null {
  const key = event.key.toLowerCase();
  const ctrl = event.ctrlKey || event.metaKey;
  for (const { id, chord } of CHORDS) {
    if ((ALIASES[chord.key] ?? chord.key) === key && chord.ctrl === ctrl && chord.shift === event.shiftKey && chord.alt === event.altKey) return id;
  }
  return null;
}

const isEditable = (target: EventTarget | null): boolean => {
  const element = target as { tagName?: string; isContentEditable?: boolean } | null;
  return !!element && (element.isContentEditable === true || ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName ?? ''));
};

/**
 * Plain letter accelerators (Shift+C / Shift+V) and Insert must not fire while typing, while F-keys and Ctrl chords always do.
 */
export function shouldHandle(command: CommandId, target: EventTarget | null): boolean {
  const accelerator = COMMANDS[command].accelerator ?? '';
  const isTypingKey = !accelerator.includes('CmdOrCtrl') && /^((Shift\+)?[A-Z]|Insert)$/.test(accelerator);
  return !(isTypingKey && isEditable(target));
}

/** The shortcut text shown next to menu items ("Ctrl+N"). */
export function displayAccelerator(command: CommandId): string {
  return (COMMANDS[command].accelerator ?? '').replace('CmdOrCtrl', 'Ctrl');
}
