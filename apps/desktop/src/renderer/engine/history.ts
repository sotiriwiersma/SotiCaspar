/**
 * Undo / redo stacks of whole-state snapshots.
 *
 * The rundown tree is immutable (every edit builds a new `nodes` array and shares the untouched parts), so a
 * snapshot is a handful of references, not a copy. That makes "remember the state before the edit" both cheap and
 * exact, and keeps undo correct for any future edit without writing an inverse operation for it.
 *
 * Generic over the snapshot type so it can be tested (and reused) without a rundown.
 */

export interface HistoryEntry<S> {
  /** What the step did, for "Undo Delete" style labels. */
  readonly label: string;
  /** State before the step: what undo returns to. */
  readonly before: S;
  /** Consecutive steps with the same key (typing in one inspector field) merge into one while they keep coming. */
  readonly mergeKey?: string;
  /** Time of the last step merged into this entry. */
  at: number;
}

export interface HistoryOptions {
  /** Oldest steps are dropped past this many. */
  limit?: number;
  /** Steps with the same merge key closer together than this (ms) become one. */
  mergeWindow?: number;
  /** Clock, replaceable in tests. */
  now?: () => number;
}

export class UndoHistory<S> {
  private past: HistoryEntry<S>[] = [];
  /** Undone steps, with the state to go back to on redo in `before`. */
  private future: HistoryEntry<S>[] = [];
  private readonly limit: number;
  private readonly mergeWindow: number;
  private readonly now: () => number;

  constructor(options: HistoryOptions = {}) {
    this.limit = options.limit ?? 200;
    this.mergeWindow = options.mergeWindow ?? 1000;
    this.now = options.now ?? Date.now;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  /** Label of the step undo would revert, or null. */
  get undoLabel(): string | null {
    return this.past.at(-1)?.label ?? null;
  }

  get redoLabel(): string | null {
    return this.future.at(-1)?.label ?? null;
  }

  /** Records a finished step, given the state from before it. A new step makes the undone ones unreachable. */
  record(label: string, before: S, mergeKey?: string): void {
    const at = this.now();
    const last = this.past.at(-1);
    this.future = [];
    if (mergeKey !== undefined && last?.mergeKey === mergeKey && at - last.at <= this.mergeWindow) {
      // Keep the oldest `before`: undo then reverts the whole burst.
      last.at = at;
      return;
    }
    this.past.push({ label, before, mergeKey, at });
    if (this.past.length > this.limit) this.past.splice(0, this.past.length - this.limit);
  }

  /** Ends any merging: the next step starts a new entry even with the same key (e.g. on blur or selection change). */
  seal(): void {
    const last = this.past.at(-1);
    if (last) last.at = -Infinity;
  }

  /** Steps back. `current` is the state now (kept for redo); returns the state to restore, or null. */
  undo(current: S): S | null {
    const entry = this.past.pop();
    if (!entry) return null;
    this.future.push({ label: entry.label, before: current, at: -Infinity });
    return entry.before;
  }

  /** Steps forward again after an undo. */
  redo(current: S): S | null {
    const entry = this.future.pop();
    if (!entry) return null;
    this.past.push({ label: entry.label, before: current, at: -Infinity });
    return entry.before;
  }

  clear(): void {
    this.past = [];
    this.future = [];
  }
}
